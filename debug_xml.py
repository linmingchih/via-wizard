import xml.etree.ElementTree as ET
import os

def parse_stackup_xml(path):
    print(f"Parsing {path}...")
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return

    try:
        tree = ET.parse(path)
        root = tree.getroot()
        
        # Debug root tag and namespace
        print(f"Root tag: {root.tag}")
        
        stackup_node = root.find(".//Stackup")
        if stackup_node is None:
            stackup_node = root.find("Stackup")
        
        # If still None, try to handle namespace manually if present
        if stackup_node is None:
            # Check if root has namespace
            if '}' in root.tag:
                ns = root.tag.split('}')[0] + '}'
                print(f"Detected namespace: {ns}")
                stackup_node = root.find(f".//{ns}Stackup")
                if stackup_node is None:
                     stackup_node = root.find(f"{ns}Stackup")

        if stackup_node is None:
             # Fallback for simple structure
             if 'Stackup' in root.tag:
                 stackup_node = root
             else:
                 print("Could not find Stackup node")
                 return

        print("Found Stackup node")

        # 1. Parse Materials
        materials_map = {}
        materials_node = stackup_node.find("Materials")
        # Handle namespace for Materials if needed
        if materials_node is None and '}' in stackup_node.tag:
             ns = stackup_node.tag.split('}')[0] + '}'
             materials_node = stackup_node.find(f"{ns}Materials")

        if materials_node is not None:
            print(f"Found Materials node with {len(list(materials_node))} children")
            for mat in materials_node: # Iterate children directly
                name = mat.get("Name")
                props = {"dk": 0, "df": 0, "conductivity": 0}
                
                def get_val(parent, tag):
                    # Try with and without namespace
                    node = parent.find(tag)
                    if node is None and '}' in parent.tag:
                        ns = parent.tag.split('}')[0] + '}'
                        node = parent.find(f"{ns}{tag}")
                        
                    if node is not None:
                        d = node.find("Double")
                        if d is None and '}' in node.tag:
                             ns = node.tag.split('}')[0] + '}'
                             d = node.find(f"{ns}Double")
                             
                        if d is not None:
                            return float(d.text)
                    return 0

                props["dk"] = get_val(mat, "Permittivity")
                props["df"] = get_val(mat, "DielectricLossTangent")
                props["conductivity"] = get_val(mat, "Conductivity")
                
                materials_map[name] = props
                # print(f"Parsed Material: {name} -> {props}")
        else:
            print("Materials node not found")

        # 2. Parse Layers
        layers = []
        layers_node = stackup_node.find("Layers")
        if layers_node is None and '}' in stackup_node.tag:
             ns = stackup_node.tag.split('}')[0] + '}'
             layers_node = stackup_node.find(f"{ns}Layers")

        if layers_node is not None:
            print(f"Found Layers node with {len(list(layers_node))} children")
            for layer_node in layers_node:
                mat_name = layer_node.get("Material", "")
                mat_props = materials_map.get(mat_name, {"dk": 0, "df": 0, "conductivity": 0})
                
                raw_type = layer_node.get("Type", "Dielectric").lower()
                if "conductor" in raw_type:
                    final_type = "Conductor"
                else:
                    final_type = "Dielectric"

                layer_data = {
                    "name": layer_node.get("Name", "Layer"),
                    "type": final_type,
                    "thickness": float(layer_node.get("Thickness", "0")),
                    "dk": mat_props["dk"],
                    "df": mat_props["df"],
                    "conductivity": mat_props["conductivity"],
                    "fillMaterial": layer_node.get("FillMaterial", ""),
                    "isReference": layer_node.get("IsReference", "false").lower() == "true"
                }
                layers.append(layer_data)
            
            print(f"Parsed {len(layers)} layers.")
        else:
            print("Layers node not found")

    except Exception as e:
        print(f"Error parsing XML: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    parse_stackup_xml("stack.xml")
