from pyedb import Edb
import json

edb = Edb(version='2024.1')

with open('d:/demo/project.json', 'r') as f:
    data = json.load(f)



for layer in data['stackup']:
    material_name = f'm_{layer["name"]}'
    if layer['type'] == 'Conductor':
        edb.materials.add_conductor_material(material_name, layer['conductivity'])
    else:
        edb.materials.add_dielectric_material(material_name, layer['dk'], layer['df'])
        fill_material = material_name
    
    layer_type = 'signal' if layer['type'] == 'Conductor' else 'dielectric'
    edb.stackup.add_layer_bottom(name=layer['name'],
                                 layer_type=layer_type,
                                 material = material_name,
                                 thickness=f"{layer['thickness']}{data['units']}",)
    if layer["isReference"] == True:
        edb.modeler.create_rectangle(layer['name'], 
                                     net_name='GND', 
                                     center_point=(0,0),
                                     width=f'{data["boardWidth"]}mil',
                                     height=f'{data["boardHeight"]}mil',
                                     representation_type="CenterWidthHeight")
for padstack in data['padstacks']:
    padstack['name']
        
    edb.padstacks.create_circular_padstack(padstackname=padstack['name'],
                                           holediam=padstack['holeDiameter'],
                                           paddiam=padstack['padSize'],
                                           antipaddiam=padstack['antipadSize'],
                                           startlayer=padstack['startLayer'],
                                           endlayer=padstack['stopLayer'])



edb.save_edb_as('d:/demo/abc.edb')