from pyedb import Edb
from functools import partial
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

index_padstack = {}
for n, padstack in enumerate(data['padstacks']):
    index_padstack[n] = padstack['name']
    edb.padstacks.create_circular_padstack(padstackname=padstack['name'],
                                           holediam= f'{padstack["holeDiameter"]}mil',
                                           paddiam= f'{padstack["padSize"] }mil',
                                           antipaddiam= f'{padstack["antipadSize"]}mil',
                                           startlayer=padstack['startLayer'],
                                           endlayer=padstack['stopLayer'])

def to_mil(x, y):
    return (f"{x}mil", f"{y}mil")

create_trace = partial(edb.modeler.create_trace, start_cap_style="Flat", end_cap_style="Flat")

for via in data['placedInstances']:
    via['id']
    via['type']
    
    locations = via.get('viaLocations', [{'x': via['x'], 'y': via['y']}])
    index = via['padstackIndex']
    
    for loc in locations:
        x = f'{loc["x"]}mil'
        y = f'{loc["y"]}mil'
        edb.padstacks.place_padstack((x, y), index_padstack[index])
    
    if via['type'] == 'gnd':    
        continue
    
    feed_in_layer = via['properties']['feedIn']
    feed_in_width = str(via['properties']['feedInWidth']) + 'mil'
    feed_out_layer = via['properties']['feedOut']
    feed_out_width = str(via['properties']['feedOutWidth']) + 'mil'
    
    if via['type'] == 'single':
        feed_in_pts = []
        for pt in via['feedPaths']['feedIn'][0]:
            feed_in_pts.append(to_mil(pt['x'], pt['y']))
        
        create_trace(feed_in_pts, feed_in_layer, feed_in_width)
        
        feed_out_pts = []
        for pt in via['feedPaths']['feedOut'][0]:        
            feed_out_pts.append(to_mil(pt['x'], pt['y']))
        
        create_trace(feed_out_pts, feed_out_layer, feed_out_width)
    
    elif via['type'] == 'differential':
        feed_in_pts_p = []
        feed_in_pts_n = []
        
        for pt in via['feedPaths']['feedIn'][0]:
            feed_in_pts_p.append(to_mil(pt['x'], pt['y']))
        
        create_trace(feed_in_pts_p, feed_in_layer, feed_in_width)
        
        for pt in via['feedPaths']['feedIn'][1]:
            feed_in_pts_n.append(to_mil(pt['x'], pt['y']))        
        
        create_trace(feed_in_pts_n, feed_in_layer, feed_in_width)
        
        feed_out_pts_p = []        
        feed_out_pts_n = []
        
        for pt in via['feedPaths']['feedOut'][0]:        
            feed_out_pts_p.append(to_mil(pt['x'], pt['y']))
        
        create_trace(feed_out_pts_p, feed_out_layer, feed_out_width)
        
        for pt in via['feedPaths']['feedOut'][1]:        
            feed_out_pts_n.append(to_mil(pt['x'], pt['y']))            
        
        create_trace(feed_out_pts_n, feed_out_layer, feed_out_width)

edb.save_edb_as('d:/demo/abc.edb')