import webview
import time
import xml.etree.ElementTree as ET
import os

class ViaWizardAPI:
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def open_file_dialog(self):
        print("API: open_file_dialog called")
        try:
            file_path = self._window.create_file_dialog(webview.OPEN_DIALOG, directory='', file_types=('XML Files (*.xml)', 'All files (*.*)'))
            if file_path:
                if isinstance(file_path, (list, tuple)):
                    return file_path[0]
                return file_path
        except Exception as e:
            self.log_message(f"Error opening file dialog: {e}")
            import traceback
            traceback.print_exc()
        return None

    def parse_stackup_xml(self, path):
        print(f"API: parse_stackup_xml called with {path}")
        if not os.path.exists(path):
            self.log_message(f"File not found: {path}")
            return self.get_stackup_data()

        try:
            tree = ET.parse(path)
            root = tree.getroot()
            
            # Helper to find node with or without namespace
            def find_node(parent, tag):
                # Try direct find
                node = parent.find(tag)
                if node is not None: return node
                
                # Try finding with parent's namespace
                if '}' in parent.tag:
                    ns = parent.tag.split('}')[0] + '}'
                    node = parent.find(f"{ns}{tag}")
                    if node is not None: return node
                    
                # Try finding with recursive search (ignoring namespace for simplicity)
                # This is expensive but robust for this specific file structure
                for elem in parent.iter():
                    if elem.tag.endswith(f"}} {tag}") or elem.tag == tag:
                        return elem
                return None
            
            # Find Stackup
            stackup_node = root.find(".//Stackup")
            if stackup_node is None:
                # Try with namespace
                if '}' in root.tag:
                    ns = root.tag.split('}')[0] + '}'
                    stackup_node = root.find(f".//{ns}Stackup")
            
            if stackup_node is None:
                # Fallback: iterate and check tag name
                for elem in root.iter():
                    if 'Stackup' in elem.tag:
                        stackup_node = elem
                        break
            
            if stackup_node is None:
                 self.log_message("Could not find Stackup node in XML")
                 return []

            # 1. Parse Materials
            materials_map = {}
            materials_node = None
            
            # Find Materials node (handling namespace)
            for child in stackup_node:
                if 'Materials' in child.tag:
                    materials_node = child
                    break
            
            if materials_node is not None:
                for mat in materials_node:
                    name = mat.get("Name")
                    props = {"dk": 0, "df": 0, "conductivity": 0}
                    
                    def get_val(parent, tag_name):
                        for child in parent:
                            if tag_name in child.tag:
                                for sub in child:
                                    if 'Double' in sub.tag:
                                        return float(sub.text)
                        return 0

                    props["dk"] = get_val(mat, "Permittivity")
                    props["df"] = get_val(mat, "DielectricLossTangent")
                    props["conductivity"] = get_val(mat, "Conductivity")
                    
                    materials_map[name] = props

            # 2. Parse Layers
            layers = []
            layers_node = None
            length_unit = "mm" # Default

            for child in stackup_node:
                if 'Layers' in child.tag:
                    layers_node = child
                    break

            if layers_node is not None:
                length_unit = layers_node.get("LengthUnit", "mm")
                for layer_node in layers_node:
                    mat_name = layer_node.get("Material", "")
                    mat_props = materials_map.get(mat_name, {"dk": 0, "df": 0, "conductivity": 0})
                    
                    raw_type = layer_node.get("Type", "Dielectric").lower()
                    if "conductor" in raw_type:
                        final_type = "Conductor"
                    else:
                        final_type = "Dielectric"

                    # Enforce property visibility rules
                    dk = mat_props["dk"]
                    df = mat_props["df"]
                    cond = mat_props["conductivity"]

                    if final_type == "Conductor":
                        dk = ""
                        df = ""
                    else: # Dielectric
                        cond = ""

                    layer_data = {
                        "name": layer_node.get("Name", "Layer"),
                        "type": final_type,
                        "thickness": float(layer_node.get("Thickness", "0")),
                        "dk": dk,
                        "df": df,
                        "conductivity": cond,
                        "fillMaterial": layer_node.get("FillMaterial", ""),
                        "isReference": layer_node.get("IsReference", "false").lower() == "true"
                    }
                    layers.append(layer_data)
                
            self.log_message(f"Parsed {len(layers)} layers from XML. Unit: {length_unit}")
            return {"layers": layers, "unit": length_unit}

        except Exception as e:
            self.log_message(f"Error parsing XML: {e}")
            import traceback
            traceback.print_exc()
            return {"layers": [], "unit": "mm"}

    def save_stackup_xml(self, path, data):
        print(f"API: save_stackup_xml called with {len(data)} layers")
        try:
            # Create root structure similar to stack.xml
            # <c:Control ...> <Stackup> ...
            # For simplicity, we'll create a standard root, maybe just Stackup or match the input
            
            # Let's try to match the schema: Control -> Stackup
            root = ET.Element("c:Control", {"xmlns:c": "http://www.ansys.com/control", "schemaVersion": "1.0"})
            stackup = ET.SubElement(root, "Stackup", {"schemaVersion": "1.0"})
            
            materials_node = ET.SubElement(stackup, "Materials")
            layers_node = ET.SubElement(stackup, "Layers", {"LengthUnit": "mil"}) # Defaulting to mil as per example, or should check current units?
            
            # We need to collect unique materials to write to <Materials>
            # And assign Material names to Layers
            
            created_materials = set()
            
            for i, layer in enumerate(data):
                # Generate a material name if not standard
                # Or just use "Mat_LayerName" for simplicity if properties exist
                
                dk = float(layer.get("dk", 0) or 0)
                df = float(layer.get("df", 0) or 0)
                cond = float(layer.get("conductivity", 0) or 0)
                
                mat_name = "AIR" # Default
                
                # If it has specific properties, create a material
                if dk > 0 or df > 0 or cond > 0:
                    mat_name = f"Mat_{layer.get('name')}"
                    
                    # Check if we already created this material (deduplication could be done but simple is fine)
                    if mat_name not in created_materials:
                        mat_elem = ET.SubElement(materials_node, "Material", {"Name": mat_name})
                        
                        if dk > 0:
                            perm = ET.SubElement(mat_elem, "Permittivity")
                            ET.SubElement(perm, "Double").text = str(dk)
                        
                        if df > 0:
                            loss = ET.SubElement(mat_elem, "DielectricLossTangent")
                            ET.SubElement(loss, "Double").text = str(df)
                            
                        if cond > 0:
                            c = ET.SubElement(mat_elem, "Conductivity")
                            ET.SubElement(c, "Double").text = str(cond)
                            
                        created_materials.add(mat_name)
                
                # Create Layer node
                layer_elem = ET.SubElement(layers_node, "Layer")
                layer_elem.set("Name", str(layer.get("name")))
                layer_elem.set("Type", str(layer.get("type")))
                layer_elem.set("Thickness", str(layer.get("thickness")))
                layer_elem.set("Material", mat_name)
                
                fill = layer.get("fillMaterial")
                if fill:
                    layer_elem.set("FillMaterial", fill)
                    
                if layer.get("isReference"):
                     layer_elem.set("IsReference", "true")

            tree = ET.ElementTree(root)
            ET.indent(tree, space="  ", level=0)
            tree.write(path, encoding="utf-8", xml_declaration=True)
            
            self.log_message(f"Saved stackup to {path}")
            
        except Exception as e:
            self.log_message(f"Error saving XML: {e}")
            import traceback
            traceback.print_exc()

    def save_project(self, data):
        print(f"API: save_project called with data keys: {list(data.keys())}")
        try:
            file_path = self._window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename='project.json', file_types=('JSON Files (*.json)', 'All files (*.*)'))
            if file_path:
                if isinstance(file_path, (list, tuple)):
                    file_path = file_path[0]
                
                import json
                with open(file_path, 'w') as f:
                    json.dump(data, f, indent=4)
                self.log_message(f"Project saved to {file_path}")
                return True
        except Exception as e:
            self.log_message(f"Error saving project: {e}")
            import traceback
            traceback.print_exc()
        return False

    def export_aedb(self, data, version):
        print(f"API: export_aedb called with version {version}")
        try:
            # Save JSON first
            file_path = self._window.create_file_dialog(webview.SAVE_DIALOG, directory='', save_filename='project.json', file_types=('JSON Files (*.json)', 'All files (*.*)'))
            if file_path:
                if isinstance(file_path, (list, tuple)):
                    file_path = file_path[0]
                
                import json
                with open(file_path, 'w') as f:
                    json.dump(data, f, indent=4)
                self.log_message(f"Project saved to {file_path}")
                
                # Call modeling.py
                import subprocess
                import sys
                
                # Assume modeling.py is in the same directory as api.py
                script_path = os.path.join(os.path.dirname(__file__), 'modeling.py')
                
                self.log_message(f"Calling modeling.py with {file_path} and version {version}")
                
                # Use Popen to run in background/separate process
                subprocess.Popen([sys.executable, script_path, file_path, version])
                
                self.log_message("Export process started.")
                return True
        except Exception as e:
            self.log_message(f"Error exporting AEDB: {e}")
            import traceback
            traceback.print_exc()
        return False

    def load_project(self):
        print("API: load_project called")
        try:
            file_path = self._window.create_file_dialog(webview.OPEN_DIALOG, directory='', file_types=('JSON Files (*.json)', 'All files (*.*)'))
            if file_path:
                if isinstance(file_path, (list, tuple)):
                    file_path = file_path[0]
                
                import json
                with open(file_path, 'r') as f:
                    data = json.load(f)
                self.log_message(f"Project loaded from {file_path}")
                return data
        except Exception as e:
            self.log_message(f"Error loading project: {e}")
            import traceback
            traceback.print_exc()
        return None

    def exit_app(self):
        print("API: exit_app called")
        if self._window:
            self._window.destroy()

    def log_message(self, message):
        print(f"API: log_message -> {message}")
        if self._window:
            safe_message = str(message).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
            self._window.evaluate_js(f"addMessage('{safe_message}')")

    def get_stackup_data(self):
        print("API: get_stackup_data called")
        # Mock stackup data
        layers = [
            {"name": "Top", "type": "Conductor", "thickness": 0.035, "dk": "", "df": "", "conductivity": 5.8e7, "fillMaterial": "", "isReference": False},
            {"name": "Dielectric1", "type": "Dielectric", "thickness": 0.1, "dk": 4.4, "df": 0.02, "conductivity": "", "fillMaterial": "", "isReference": False},
            {"name": "Bottom", "type": "Conductor", "thickness": 0.035, "dk": "", "df": "", "conductivity": 5.8e7, "fillMaterial": "", "isReference": False}
        ]
        return {"layers": layers, "unit": "mm"}
