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
        self.plating = data_dict.get('plating', 100)
        self.material = data_dict.get('material', 'copper')
        self.start_layer = data_dict['startLayer']
        self.stop_layer = data_dict['stopLayer']
        self.antipad_value = data_dict['antipadSize'] # Stored for void creation later

        # Backdrill info
        bd_data = data_dict.get('backdrill', {})
        self.bd_enabled = bd_data.get('enabled', False)
        self.bd_diameter = f'{bd_data.get("diameter", 0)}{units}'
        self.bd_mode = bd_data.get('mode', 'layer')
        self.bd_to_layer = bd_data.get('toLayer', '')
        self.bd_stub = f'{bd_data.get("stub", 0)}{units}'
        self.bd_depth = f'{bd_data.get("depth", 0)}{units}'

    def create_in_edb(self, edb_padstacks):
        """Creates the padstack definition in the EDB project."""
        edb_padstacks.create_padstack(
            padstackname=self.name,
            holediam=self.hole_diameter,
            paddiam=self.pad_size,
            antipaddiam=self.antipad_size,
            startlayer=self.start_layer,
            endlayer=self.stop_layer,
        )
        edb_padstacks.definitions[self.name].hole_plating_ratio = self.plating
        edb_padstacks.definitions[self.name].material = self.material
        
        
# --- 2. ViaInstance Class ---
class ViaInstance:
    """Represents a placed Via instance from the JSON data."""
    def __init__(self, data_dict: dict, padstack_config: PadstackConfig, units: str, to_mil_func, all_padstack_configs: dict = None):
        self.name = data_dict["name"]
        self.type = data_dict['type']
        self.x = data_dict["x"]
        self.y = data_dict["y"]

        feed_in_layer = self.properties.get('feedIn')
        feed_out_layer = self.properties.get('feedOut')

        if self.type == 'single':
            # Input Port
            if feed_in_layer:
                feed_in_width = self._get_feed_width('feedInWidth')
                in_pts = self._get_feed_points(self.feed_paths['feedIn'][0])
                trace_in = create_trace_func(in_pts, feed_in_layer, feed_in_width, 'net_'+self.name)
                edb_hfss.create_wave_port(trace_in, in_pts[-1], self.name + '_IN')
            
            # Output Port
            if feed_out_layer:
                feed_out_width = self._get_feed_width('feedOutWidth')
                out_pts = self._get_feed_points(self.feed_paths['feedOut'][0])
                trace_out = create_trace_func(out_pts, feed_out_layer, feed_out_width, 'net_'+self.name)
                edb_hfss.create_wave_port(trace_out, out_pts[-1], self.name + '_OUT')

        elif self.type == 'differential':
            # Input Port
            if feed_in_layer:
                feed_in_width = self._get_feed_width('feedInWidth')
                in_pts_p = self._get_feed_points(self.feed_paths['feedIn'][0])
                in_pts_n = self._get_feed_points(self.feed_paths['feedIn'][1])
                trace_in_p = create_trace_func(in_pts_p, feed_in_layer, feed_in_width, 'netp_'+self.name)
                trace_in_n = create_trace_func(in_pts_n, feed_in_layer, feed_in_width, 'netn_'+self.name)
                edb_hfss.create_differential_wave_port(
                    trace_in_p, in_pts_p[-1], trace_in_n, in_pts_n[-1], self.name + '_IN'
                )
            
            # Output Port
            if feed_out_layer:
                feed_out_width = self._get_feed_width('feedOutWidth')
                out_pts_p = self._get_feed_points(self.feed_paths['feedOut'][0])
                out_pts_n = self._get_feed_points(self.feed_paths['feedOut'][1])
                trace_out_p = create_trace_func(out_pts_p, feed_out_layer, feed_out_width, 'netp_'+self.name)
                trace_out_n = create_trace_func(out_pts_n, feed_out_layer, feed_out_width, 'netn_'+self.name)
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

    def _create_trace_partial(self, points, layer, width, name):
        """Wrapper for EDB trace creation with fixed end_cap_style."""
        return self.edb.modeler.create_trace(points, layer, width, end_cap_style="Flat", net_name=name)

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
            padstack_config = self.padstack_configs[padstack_name]
            
            via = ViaInstance(via_data, padstack_config, self.units, self._to_mil, self.padstack_configs)
            # Hack: Store the padstack list in the via instance so we can resolve indices
            via.padstack_list_data = padstack_list
            self.via_instances.append(via)

        # 2. Create Voids (Must be done before placing vias or traces are placed)
        layer_dogbone_map = {l['name']: l.get('dogBone', -1) for l in self.data['stackup']}
        for via in self.via_instances:
            via.create_void(self.edb.modeler, self.layer_rects, layer_dogbone_map)

        # 3. Place Vias (Padstack placements)
        for via in self.via_instances:
            via.place_via(self.edb.padstacks)
            if via.type == 'single':
                self.edb.nets.find_or_create_net('net_'+via.name)
            if via.type == 'differential':
                self.edb.nets.find_or_create_net('netp_'+via.name)
                self.edb.nets.find_or_create_net('netn_'+via.name)                

        # 4. Create Traces and Ports
        for via in self.via_instances:
            via.create_ports_and_traces(self._create_trace_partial, self.edb.hfss)

        # 5. Create Components from Pins
        self.create_components_from_pins()

    def create_components_from_pins(self):
        """Groups pins by component name and creates components."""
        component_groups = {}
        for via in self.via_instances:
            # Check if via name implies a component (contains '.')
            if '.' in via.name:
                component_name = via.name.split('.')[0]
                if component_name not in component_groups:
                    component_groups[component_name] = []
                component_groups[component_name].extend(via.placed_pins)
        
        for comp_name, pins in component_groups.items():
            if pins:
                try:
                    # Ensure pins are unique before creating component
                    unique_pins = list(set(pins))
                    self.edb.components.create_component_from_pins(unique_pins, comp_name)
                    print(f"Created component '{comp_name}' from {len(unique_pins)} pins.")
                except Exception as e:
                    print(f"Error creating component '{comp_name}': {e}")

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