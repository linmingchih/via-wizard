from pyedb import Edb
from functools import partial
import json

edb = Edb(version='2024.1')

with open('d:/demo/project.json', 'r') as f:
    data = json.load(f)

for layer in data['stackup']:
    if layer['thickness'] == 0:
        continue
    
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
    edb.padstacks.create_padstack(padstackname=padstack['name'],
                                           holediam= f'{padstack["holeDiameter"]}mil',
                                           paddiam= f'{padstack["padSize"] }mil',
                                           antipaddiam= f'{padstack["antipadSize"]}mil',
                                           startlayer=padstack['startLayer'],
                                           endlayer=padstack['stopLayer'])


def to_mil(x, y):
    return (f"{x}mil", f"{y}mil")

create_trace = partial(edb.modeler.create_trace, end_cap_style="Flat")

for via in data['placedInstances']:
    via_name = via["name"]

    index = via['padstackIndex']

    x0 = via["x"]
    y0 = via["y"]

    if via['type'] == 'single':
        edb.padstacks.place_padstack(to_mil(x0, y0), index_padstack[index])

    elif via['type'] == 'gnd':
        edb.padstacks.place_padstack(to_mil(x0, y0), index_padstack[index], 'GND')
        continue
    
    else:
        p = via['properties']["pitch"]
        if via['properties']["orientation"] =="vertical":
            edb.padstacks.place_padstack(to_mil(x0, y0 + p/2), index_padstack[index])
            edb.padstacks.place_padstack(to_mil(x0, y0 - p/2), index_padstack[index])
        else:
            edb.padstacks.place_padstack(to_mil(x0 + p/2, y0), index_padstack[index])
            edb.padstacks.place_padstack(to_mil(x0 - p/2, y0), index_padstack[index])       

            
    locations = via.get('viaLocations', [{'x': via['x'], 'y': via['y']}])            
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
        
        trace = create_trace(feed_in_pts, feed_in_layer, feed_in_width)
        edb.hfss.create_wave_port(trace, feed_in_pts[-1], via_name + '_IN')
        
        feed_out_pts = []
        for pt in via['feedPaths']['feedOut'][0]:        
            feed_out_pts.append(to_mil(pt['x'], pt['y']))
        
        trace = create_trace(feed_out_pts, feed_out_layer, feed_out_width)
        edb.hfss.create_wave_port(trace, feed_out_pts[-1], via_name + '_OUT')
    
    elif via['type'] == 'differential':
        feed_in_pts_p = []
        feed_in_pts_n = []
        
        for pt in via['feedPaths']['feedIn'][0]:
            feed_in_pts_p.append(to_mil(pt['x'], pt['y']))
        
        trace_p = create_trace(feed_in_pts_p, feed_in_layer, feed_in_width)
        loc_p = feed_in_pts_p[-1]
        
        for pt in via['feedPaths']['feedIn'][1]:
            feed_in_pts_n.append(to_mil(pt['x'], pt['y']))        
        
        trace_n = create_trace(feed_in_pts_n, feed_in_layer, feed_in_width)
        loc_n = feed_in_pts_n[-1]
        
        edb.hfss.create_differential_wave_port(trace_p, loc_p, trace_n, loc_n, via_name + '_IN')
        
        feed_out_pts_p = []        
        feed_out_pts_n = []
        
        for pt in via['feedPaths']['feedOut'][0]:        
            feed_out_pts_p.append(to_mil(pt['x'], pt['y']))
        
        trace_p = create_trace(feed_out_pts_p, feed_out_layer, feed_out_width)
        loc_p = feed_out_pts_p[-1]
        
        for pt in via['feedPaths']['feedOut'][1]:        
            feed_out_pts_n.append(to_mil(pt['x'], pt['y']))            
        
        trace_n = create_trace(feed_out_pts_n, feed_out_layer, feed_out_width)
        loc_n = feed_out_pts_n[-1]
        
        edb.hfss.create_differential_wave_port(trace_p, loc_p, trace_n, loc_n, via_name + '_OUT')

edb.save_edb_as('d:/demo/abc.edb')