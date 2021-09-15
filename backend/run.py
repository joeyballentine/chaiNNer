from sanic import Sanic
from sanic.response import json
from sanic_cors import CORS, cross_origin

from nodes.NodeFactory import NodeFactory

app = Sanic("chaiNNer")
CORS(app)


@app.route('/nodes')
async def test(request):
    registry = NodeFactory.get_registry()
    output = []
    for category in registry:
        category_dict = {'category': category, 'nodes': []}
        for node in registry[category]:
            node_object = NodeFactory.create_node(category, node)
            node_dict = {'name': node}
            node_dict['inputs'] = node_object.get_inputs()
            node_dict['outputs'] = node_object.get_outputs()

            category_dict['nodes'].append(node_dict)
        output.append(category_dict)
    return json(output)


if __name__ == '__main__':
    app.run()