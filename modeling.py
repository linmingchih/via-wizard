import os
import sys
import json
from pyedb import Edb
from functools import partial

# --- 1. PadstackConfig Class ---
class PadstackConfig:
    """Represents a Padstack definition from the JSON data."""
    def __init__(self, data_dict: dict, units: str):
        self.name = data_dict['name']
        self.hole_diameter = f'{data_dict["holeDiameter"]}{units}'
        self.pad_size = f'{data_dict["padSize"]}{units}'
        self.antipad_size = f'{data_dict["antipadSize"]}{units}'
        self.start_layer = data_dict['startLayer']
        self.stop_layer = data_dict['stopLayer']
        self.antipad_value = data_dict['antipadSize'] # Stored for void creation later

    def create_in_edb(self, edb_padstacks):
        """Creates the padstack definition in the EDB project."""
        edb_padstacks.create_padstack(
            padstackname=self.name,
            holediam=self.hole_diameter,
            paddiam=self.pad_size,
            antipaddiam=self.antipad_size,
            startlayer=self.start_layer,
            endlayer=self.stop_layer
        )

# --- 2. ViaInstance Class ---
class ViaInstance:
    """Represents a placed Via instance from the JSON data."""
    def __init__(self, data_dict: dict, padstack_config: PadstackConfig, units: str, to_mil_func):
        self.name = data_dict["name"]
        self.type = data_dict['type']
        self.x = data_dict["x"]
        self.y = data_dict["y"]
        self.properties = data_dict.get('properties', {})
        self.feed_paths = data_dict.get('feedPaths', {})
        self.padstack_name = padstack_config.name
        self.antipad_value = padstack_config.antipad_value
        self._units = units
        self._to_mil = to_mil_func

    def _get_feed_points(self, path_data):
        """Converts path coordinates to unit strings."""
        return [self._to_mil(pt['x'], pt['y']) for pt in path_data]

    def _get_feed_width(self, key):
        """Gets feed width as a string with units."""
        return f"{self.properties[key]}{self._units}"

    def place_via(self, edb_padstacks):
        """Places the via instance(s) in the EDB project based on its type."""
        center = self._to_mil(self.x, self.y)
        
        if self.type == 'gnd':
            edb_padstacks.place_padstack(center, self.padstack_name, 'GND')
        elif self.type == 'single':
            edb_padstacks.place_padstack(center, self.padstack_name)
        elif self.type == 'differential':
            pitch = self.properties["pitch"]
            # Calculate P and N locations based on orientation
            if self.properties["orientation"] == "vertical":
                p_loc = self._to_mil(self.x, self.y + pitch / 2)
                n_loc = self._to_mil(self.x, self.y - pitch / 2)
            else: # horizontal
                p_loc = self._to_mil(self.x + pitch / 2, self.y)
                n_loc = self._to_mil(self.x - pitch / 2, self.y)
            edb_padstacks.place_padstack(p_loc, self.padstack_name)
            edb_padstacks.place_padstack(n_loc, self.padstack_name)

    def create_void(self, edb_modeler, layer_rects: dict):
        """Creates an antipad void on reference layers for differential vias."""
        if self.type != 'differential':
            return
        
        pitch = self.properties["pitch"]
        antipad_size = self.antipad_value

        # Void geometry is based on pitch and antipad size
        if self.properties["orientation"] == "horizontal":
            width = f'{pitch}{self._units}'
            height = f'{antipad_size}{self._units}'
        else:
            width = f'{antipad_size}{self._units}'
            height = f'{pitch}{self._units}'

        # Create void rectangle and subtract it from all reference planes
        for layer, rect in layer_rects.items():
            void = edb_modeler.create_rectangle(
                layer,
                center_point=self._to_mil(self.x, self.y),
                width=width,
                height=height,
                representation_type="CenterWidthHeight"
            )
            edb_modeler.add_void(rect, void)

    def create_ports_and_traces(self, create_trace_func, edb_hfss):
        """Creates traces and ports for non-GND vias."""
        if self.type == 'gnd':
            return

        feed_in_layer = self.properties['feedIn']
        feed_in_width = self._get_feed_width('feedInWidth')
        feed_out_layer = self.properties['feedOut']
        feed_out_width = self._get_feed_width('feedOutWidth')

        if self.type == 'single':
            # Input Port
            in_pts = self._get_feed_points(self.feed_paths['feedIn'][0])
            trace_in = create_trace_func(in_pts, feed_in_layer, feed_in_width)
            edb_hfss.create_wave_port(trace_in, in_pts[-1], self.name + '_IN')
            # Output Port
            out_pts = self._get_feed_points(self.feed_paths['feedOut'][0])
            trace_out = create_trace_func(out_pts, feed_out_layer, feed_out_width)
            edb_hfss.create_wave_port(trace_out, out_pts[-1], self.name + '_OUT')

        elif self.type == 'differential':
            # Input Port
            in_pts_p = self._get_feed_points(self.feed_paths['feedIn'][0])
            in_pts_n = self._get_feed_points(self.feed_paths['feedIn'][1])
            trace_in_p = create_trace_func(in_pts_p, feed_in_layer, feed_in_width)
            trace_in_n = create_trace_func(in_pts_n, feed_in_layer, feed_in_width)
            edb_hfss.create_differential_wave_port(
                trace_in_p, in_pts_p[-1], trace_in_n, in_pts_n[-1], self.name + '_IN'
            )
            # Output Port
            out_pts_p = self._get_feed_points(self.feed_paths['feedOut'][0])
            out_pts_n = self._get_feed_points(self.feed_paths['feedOut'][1])
            trace_out_p = create_trace_func(out_pts_p, feed_out_layer, feed_out_width)
            trace_out_n = create_trace_func(out_pts_n, feed_out_layer, feed_out_width)
            edb_hfss.create_differential_wave_port(
                trace_out_p, out_pts_p[-1], trace_out_n, out_pts_n[-1], self.name + '_OUT'
            )

# --- 3. EdbProject Class (Facade/Controller) ---
class EdbProject:
    """Manages the creation and configuration of the EDB project."""
    def __init__(self, json_path, aedb_version):
        self.aedb_path = os.path.splitext(json_path)[0] + '.aedb'
        self.edb = Edb(version=aedb_version)
        self.data = self._load_json(json_path)
        self.units = self.data['units']
        self.layer_rects = {} # Stores EDB object references for reference planes (for voids)
        self.padstack_configs = {} # Stores PadstackConfig objects by name
        self.via_instances = [] # Stores ViaInstance objects

    def _load_json(self, json_path):
        """Loads and returns the project JSON data."""
        with open(json_path, 'r') as f:
            return json.load(f)

    def _to_mil(self, x, y):
        """Helper to format coordinates with units."""
        return (f"{x}{self.units}", f"{y}{self.units}")

    def _create_trace_partial(self, points, layer, width):
        """Wrapper for EDB trace creation with fixed end_cap_style."""
        return self.edb.modeler.create_trace(points, layer, width, end_cap_style="Flat")

    def setup_analysis(self):
        """Sets up the HFSS extent and solution setup."""
        # Extent Info
        self.edb.core_hfss.hfss_extent_info.air_box_positive_vertical_extent = 0.5
        self.edb.core_hfss.hfss_extent_info.air_box_negative_vertical_extent = 0.5
        
        # Setup and Sweep
        setup = self.edb.create_hfss_setup("hfss_setup")
        setup.set_solution_single_frequency(frequency='2GHz', max_num_passes=20, max_delta_s=0.01)

        frequency_range = [["linear count", "0Hz", "0Hz", 1],
                           ["log scale", "1Hz", "50MHz", 50],
                           ["linear scale", "50MHz", "10GHz", '50MHz']]
        setup.add_sweep('sweep', frequency_set=frequency_range)

    def create_stackup(self):
        """Creates layers, materials, and reference ground planes."""
        for layer in self.data['stackup']:
            if layer['thickness'] == 0:
                continue
            
            material_name = f'm_{layer["name"]}'
            layer_type = 'signal' if layer['type'] == 'Conductor' else 'dielectric'

            # 1. Create Materials
            if layer['type'] == 'Conductor':
                self.edb.materials.add_conductor_material(material_name, layer['conductivity'])
            else:
                self.edb.materials.add_dielectric_material(material_name, layer['dk'], layer['df'])
            
            # 2. Create Layers
            self.edb.stackup.add_layer_bottom(
                name=layer['name'],
                layer_type=layer_type,
                material=material_name,
                thickness=f"{layer['thickness']}{self.units}",
            )
            
            # 3. Create Reference Rectangles
            if layer["isReference"] == True:
                rect = self.edb.modeler.create_rectangle(
                    layer['name'],
                    net_name='GND',
                    center_point=(0, 0),
                    width=f'{self.data["boardWidth"]}{self.units}',
                    height=f'{self.data["boardHeight"]}{self.units}',
                    representation_type="CenterWidthHeight"
                )
                self.layer_rects[layer['name']] = rect

    def create_padstacks(self):
        """Creates padstack definitions and stores them in a dictionary."""
        for padstack_data in self.data['padstacks']:
            config = PadstackConfig(padstack_data, self.units)
            config.create_in_edb(self.edb.padstacks)
            self.padstack_configs[config.name] = config

    def process_via_instances(self):
        """Creates via objects, processes voids, places vias, and creates ports/traces."""
        padstack_list = self.data['padstacks']
        
        # 1. Instantiate ViaInstance objects
        for via_data in self.data['placedInstances']:
            padstack_index = via_data['padstackIndex']
            # Find the corresponding PadstackConfig object using the index
            padstack_name = padstack_list[padstack_index]['name']
            padstack_config = self.padstack_configs[padstack_name]
            
            via = ViaInstance(via_data, padstack_config, self.units, self._to_mil)
            self.via_instances.append(via)

        # 2. Create Voids (Must be done before placing vias or traces are placed)
        for via in self.via_instances:
            via.create_void(self.edb.modeler, self.layer_rects)

        # 3. Place Vias (Padstack placements)
        for via in self.via_instances:
            via.place_via(self.edb.padstacks)

        # 4. Create Traces and Ports
        for via in self.via_instances:
            via.create_ports_and_traces(self._create_trace_partial, self.edb.hfss)

    def run_modeling(self):
        """Executes the full modeling workflow."""
        print("Starting EDB project setup...")
        self.setup_analysis()
        print("Creating stackup, materials, and reference planes...")
        self.create_stackup()
        print("Creating padstack definitions...")
        self.create_padstacks()
        print("Processing via instances (instantiation, voids, placement, traces, ports)...")
        self.process_via_instances()
        
        print(f"\nSaving EDB project to: {self.aedb_path}")
        self.edb.save_edb_as(self.aedb_path)
        self.edb.close_edb()
        print("Modeling complete.")

# --- Main Execution Block ---
if __name__ == "__main__":
    # Handle command-line arguments and fallback for testing
    if len(sys.argv) < 3:
        # Fallback for testing if run directly without args
        json_path = 'd:/demo/project.json'
        aedb_version = '2024.1'
        print(f"Using fallback parameters for testing: JSON='{json_path}', AEDB='{aedb_version}'")
    else:
        json_path = sys.argv[1]
        aedb_version = sys.argv[2]
    
    try:
        project = EdbProject(json_path, aedb_version)
        project.run_modeling()
    except FileNotFoundError:
        print(f"Error: The JSON file '{json_path}' was not found.")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred during modeling: {e}")
        # Ensure EDB is closed even on error
        try:
            project.edb.close_edb()
        except:
            pass
        sys.exit(1)