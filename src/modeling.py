import os
import sys
import json
from pyedb import Edb
from functools import partial
import math

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

        # Fill info
        fill_data = data_dict.get('fill', {})
        self.fill_enabled = fill_data.get('enabled', False)
        self.fill_dk = fill_data.get('dk', 4.0)
        self.fill_df = fill_data.get('df', 0.02)

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
        self.padstack = padstack_config
        self.placed_pins = []

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
            via = edb_padstacks.place(center, self.padstack_name, 'GND', is_pin=True)
            self.placed_pins.append(via)
        elif self.type == 'single':
            via = edb_padstacks.place(center, self.padstack_name, 'net_'+self.name, is_pin=True)
            self.placed_pins.append(via)
            if self.padstack.bd_enabled:
                via.set_backdrill_bottom(self.padstack.bd_to_layer, self.padstack.bd_diameter, self.padstack.bd_stub)
                if self.padstack.fill_enabled:
                     via_fill = edb_padstacks.place(center, f"{self.padstack_name}_fill", 'GND', is_pin=False)
                     via_fill.start_layer=self.padstack.bd_to_layer  
                     #via_fill.set_backdrill_top(self.padstack.bd_to_layer, self.padstack.bd_diameter, f"-{self.padstack.bd_stub}")


        elif self.type == 'differential':
            pitch = self.properties["pitch"]
            # Calculate P and N locations based on orientation
            if self.properties["orientation"] == "vertical":
                n_loc = self._to_mil(self.x, self.y + pitch / 2)
                p_loc = self._to_mil(self.x, self.y - pitch / 2)
            else: # horizontal
                n_loc = self._to_mil(self.x + pitch / 2, self.y)
                p_loc = self._to_mil(self.x - pitch / 2, self.y)
            via_p = edb_padstacks.place(p_loc, self.padstack_name, 'netp_'+self.name, is_pin=True)
            via_n = edb_padstacks.place(n_loc, self.padstack_name, 'netn_'+self.name, is_pin=True)
            self.placed_pins.append(via_p)
            self.placed_pins.append(via_n)
            if self.padstack.bd_enabled:
                via_p.set_backdrill_bottom(self.padstack.bd_to_layer, self.padstack.bd_diameter, self.padstack.bd_stub)
                via_n.set_backdrill_bottom(self.padstack.bd_to_layer, self.padstack.bd_diameter, self.padstack.bd_stub)
                if self.padstack.fill_enabled:
                     via_fill_p = edb_padstacks.place(p_loc, f"{self.padstack_name}_fill", 'GND', is_pin=False)
                     via_fill_p.start_layer=self.padstack.bd_to_layer  
                     #via_fill_p.set_backdrill_top(self.padstack.bd_to_layer, self.padstack.bd_diameter, f"-{self.padstack.bd_stub}")
                     via_fill_n = edb_padstacks.place(n_loc, f"{self.padstack_name}_fill", 'GND', is_pin=False)
                     via_fill_n.start_layer=self.padstack.bd_to_layer  
                     #via_fill_n.set_backdrill_top(self.padstack.bd_to_layer, self.padstack.bd_diameter, f"-{self.padstack.bd_stub}")

    def create_void(self, edb_modeler, layer_rects: dict, layer_dogbone_map: dict):
        """Creates an antipad void on reference layers for differential vias."""
        if self.type != 'differential':
            return
        
        pitch = self.properties["pitch"]
        antipad_size = self.antipad_value

        # Create void rectangle and subtract it from all reference planes
        for layer, rect in layer_rects.items():
            dogbone_val = layer_dogbone_map.get(layer, -1)
            
            # If dogbone is 0, do not create rectangle (skip void creation on this layer)
            if dogbone_val == 0:
                continue

            # Determine antipad dimension based on dogbone value
            # If -1, use original antipad size. If > 0, use dogbone value.
            current_antipad_val = dogbone_val if dogbone_val > 0 else antipad_size
            
            if self.properties["orientation"] == "horizontal":
                width = f'{pitch}{self._units}'
                height = f'{current_antipad_val}{self._units}'
            else:
                width = f'{current_antipad_val}{self._units}'
                height = f'{pitch}{self._units}'

            void = edb_modeler.create_rectangle(
                layer,
                center_point=self._to_mil(self.x, self.y),
                net_name = 'GND',
                width=width,
                height=height,
                representation_type="CenterWidthHeight"
            )
            edb_modeler.add_void(rect, void)

    def create_ports_and_traces(self, create_trace_func, edb_hfss):
        """Creates traces and ports for non-GND vias."""
        if self.type == 'gnd':
            return

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

# --- 2.5 DogBoneFeed Class ---
class DogBoneFeed:
    """Handles the creation of Dog Bone feeds (traces, pads, voids)."""
    def __init__(self, data_dict, instance_map, units, to_mil_func):
        self.name = data_dict['name']
        self.properties = data_dict.get('properties', {})
        self.units = units
        self._to_mil = to_mil_func
        
        parent_id = self.properties.get('connectedDiffPairId')
        self.parent = instance_map.get(parent_id)
        
    def process(self, edb_project):
        if not self.parent:
            print(f"Warning: DogBone {self.name} has no connected parent.")
            return

        # 1. Identify Layers
        stackup = edb_project.data['stackup']
        # Find top signal layer (first Conductor)
        top_signal_layer = next((l['name'] for l in stackup if l['type'] == 'Conductor'), None)
        # Find top reference layer (first isReference=True)
        top_ref_layer = next((l['name'] for l in stackup if l.get('isReference')), None)

        if not top_signal_layer:
            print("Error: No signal layer found for DogBone.")
            return

        # 2. Calculate Geometry
        # Parent properties
        parent_props = self.parent.get('properties', {})
        pitch = parent_props.get('pitch', 40)
        is_vert = parent_props.get('orientation') == 'vertical'
        
        parent_x = self.parent['x']
        parent_y = self.parent['y']
        
        dx = 0 if is_vert else pitch / 2
        dy = pitch / 2 if is_vert else 0
        
        # Start points (centers of the diff pair vias)
        pos_x_start = parent_x + dx
        pos_y_start = parent_y + dy
        neg_x_start = parent_x - dx
        neg_y_start = parent_y - dy
        
        # Dogbone properties
        length = self.properties.get('length', 20)
        pos_angle_deg = self.properties.get('posAngle', 45)
        neg_angle_deg = self.properties.get('negAngle', 135)
        
        pos_angle_rad = math.radians(float(pos_angle_deg))
        neg_angle_rad = math.radians(float(neg_angle_deg))
        
        # End points
        length = float(length)
        pos_x_end = pos_x_start + length * math.cos(pos_angle_rad)
        pos_y_end = pos_y_start + length * math.sin(pos_angle_rad)
        
        neg_x_end = neg_x_start + length * math.cos(neg_angle_rad)
        neg_y_end = neg_y_start + length * math.sin(neg_angle_rad)

        # 3. Create Traces
        width_val = self.properties.get('lineWidth', 5)
        width = f"{width_val}{self.units}"
        
        # Positive Trace
        pts_p = [self._to_mil(pos_x_start, pos_y_start), self._to_mil(pos_x_end, pos_y_end)]
        edb_project.edb.modeler.create_trace(pts_p, top_signal_layer, width, net_name=f"netp_{self.parent['name']}", end_cap_style="Round")
        
        # Negative Trace
        pts_n = [self._to_mil(neg_x_start, neg_y_start), self._to_mil(neg_x_end, neg_y_end)]
        edb_project.edb.modeler.create_trace(pts_n, top_signal_layer, width, net_name=f"netn_{self.parent['name']}", end_cap_style="Round")

        # 4. Create Padstack
        diam_val = self.properties.get('diameter', 10)
        pad_name = f"dogbone_{diam_val}{self.units}"
        
        if pad_name not in edb_project.edb.padstacks.definitions:
            edb_project.edb.padstacks.create(
                padstackname=pad_name,
                holediam="0",
                paddiam=f"{diam_val}{self.units}",
                antipaddiam="0",
                start_layer=top_signal_layer,
                stop_layer=top_signal_layer
            )
            
        # Place Pads
        edb_project.edb.padstacks.place(self._to_mil(pos_x_end, pos_y_end), pad_name, f"netp_{self.parent['name']}")
        edb_project.edb.padstacks.place(self._to_mil(neg_x_end, neg_y_end), pad_name, f"netn_{self.parent['name']}")
        
        # 5. Create Void
        void_val = self.properties.get('void', 0)
        if void_val > 0 and top_ref_layer:
            ref_rect = edb_project.layer_rects.get(top_ref_layer)
            if ref_rect:
                # Create circle voids
                # Note: create_circle takes (layer, x, y, radius)
                # We need to pass values with units or floats. create_circle usually expects floats if no units, or strings with units.
                # Let's use strings with units to be safe, matching _to_mil format.
                
                radius = f"{void_val/2}{self.units}"
                
                # Positive Void
                void_p = edb_project.edb.modeler.create_circle(
                    top_ref_layer,
                    self._to_mil(pos_x_end, pos_y_end)[0], 
                    self._to_mil(pos_x_end, pos_y_end)[1], 
                    radius,
                    net_name="GND"
                )
                edb_project.edb.modeler.add_void(ref_rect, void_p)
                
                # Negative Void
                void_n = edb_project.edb.modeler.create_circle(
                    top_ref_layer,
                    self._to_mil(neg_x_end, neg_y_end)[0],
                    self._to_mil(neg_x_end, neg_y_end)[1],
                    radius,
                    net_name="GND"
                )
                edb_project.edb.modeler.add_void(ref_rect, void_n)

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
            
            # Handle Fill Material and Padstack
            if config.fill_enabled and config.bd_enabled:
                fill_mat_name = f'fill_mat_{config.fill_dk}_{config.fill_df}'
                self.edb.materials.add_dielectric_material(fill_mat_name, config.fill_dk, config.fill_df)
                
                fill_padstack_name = f"{config.name}_fill"
                self.edb.padstacks.create_padstack(
                    padstackname=fill_padstack_name,
                    holediam=config.bd_diameter,
                    paddiam="0",
                    antipaddiam="0",
                    startlayer=config.bd_to_layer,
                    endlayer=config.stop_layer,
                )
                self.edb.padstacks.definitions[fill_padstack_name].material = fill_mat_name
                self.edb.padstacks.definitions[fill_padstack_name].hole_plating_ratio = 100 

            self.padstack_configs[config.name] = config

    def process_via_instances(self):
        """Creates via objects, processes voids, places vias, and creates ports/traces."""
        padstack_list = self.data['padstacks']
        
        # Build instance map for DogBones
        self.instance_map = {inst['id']: inst for inst in self.data['placedInstances']}

        # 1. Instantiate ViaInstance objects
        for via_data in self.data['placedInstances']:
            if via_data['type'] == 'dog_bone':
                continue

            padstack_index = via_data['padstackIndex']
            # Find the corresponding PadstackConfig object using the index
            padstack_name = padstack_list[padstack_index]['name']
            padstack_config = self.padstack_configs[padstack_name]
            
            via = ViaInstance(via_data, padstack_config, self.units, self._to_mil)
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

        # 5. Process DogBones
        for via_data in self.data['placedInstances']:
             if via_data['type'] == 'dog_bone':
                 db = DogBoneFeed(via_data, self.instance_map, self.units, self._to_mil)
                 db.process(self)

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