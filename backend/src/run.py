import asyncio
import functools
import gc
import logging
import os
import platform
import sys
import traceback
from json import dumps as stringify

# pylint: disable=unused-import
import cv2
from sanic import Sanic
from sanic.log import logger
from sanic.request import Request
from sanic.response import json
from sanic_cors import CORS

from nodes.categories import category_order

# Remove broken QT env var
if platform.system() == "Linux":
    os.environ.pop("QT_QPA_PLATFORM_PLUGIN_PATH")

# pylint: disable=ungrouped-imports,wrong-import-position
from nodes import image_adj_nodes  # type: ignore
from nodes import image_chan_nodes  # type: ignore
from nodes import image_dim_nodes  # type: ignore
from nodes import image_filter_nodes  # type: ignore
from nodes import image_iterator_nodes  # type: ignore
from nodes import image_nodes  # type: ignore
from nodes import image_util_nodes  # type: ignore

try:
    import torch

    # pylint: disable=unused-import,ungrouped-imports
    from nodes import pytorch_nodes  # type: ignore
except Exception as e:
    torch = None
    logger.warning(e)
    logger.info("PyTorch most likely not installed")

try:
    import onnx
    import onnxruntime

    # pylint: disable=unused-import,ungrouped-imports
    from nodes import onnx_nodes  # type: ignore
except Exception as e:
    logger.warning(e)
    logger.info("ONNX most likely not installed")


try:
    # pylint: disable=unused-import
    import ncnn_vulkan

    # pylint: disable=unused-import,ungrouped-imports
    from nodes import ncnn_nodes  # type: ignore
except Exception as e:
    logger.warning(e)
    logger.info("NCNN most likely not installed")

# pylint: disable=unused-import
from nodes import utility_nodes  # type: ignore
from nodes.node_factory import NodeFactory
from process import Executor, NodeExecutionError

app = Sanic("chaiNNer")
CORS(app)
app.ctx.executor = None
app.ctx.cache = dict()

app.config.REQUEST_TIMEOUT = sys.maxsize
app.config.RESPONSE_TIMEOUT = sys.maxsize


from sanic.log import access_logger


class SSEFilter(logging.Filter):
    def filter(self, record):
        return not (record.request.endswith("/sse") and record.status == 200)  # type: ignore


access_logger.addFilter(SSEFilter())


@app.route("/nodes")
async def nodes(_):
    """Gets a list of all nodes as well as the node information"""
    registry = NodeFactory.get_registry()
    logger.debug(category_order)

    # sort nodes in category order
    sorted_registry = sorted(
        registry.items(),
        key=lambda x: category_order.index(
            NodeFactory.create_node(x[0]).get_category()
        ),
    )
    node_list = []
    for schema_id, _node_class in sorted_registry:
        node_object = NodeFactory.create_node(schema_id)
        node_dict = {
            "schemaId": schema_id,
            "name": node_object.get_name(),
            "category": node_object.get_category(),
            "inputs": [
                x.toDict() for x in node_object.get_inputs(with_implicit_ids=True)
            ],
            "outputs": [
                x.toDict() for x in node_object.get_outputs(with_implicit_ids=True)
            ],
            "description": node_object.get_description(),
            "icon": node_object.get_icon(),
            "subcategory": node_object.get_sub_category(),
            "nodeType": node_object.get_type(),
            "hasSideEffects": node_object.get_has_side_effects(),
            "deprecated": node_object.is_deprecated(),
        }
        if node_object.get_type() == "iterator":
            node_dict["defaultNodes"] = node_object.get_default_nodes()  # type: ignore
        node_list.append(node_dict)
    return json(node_list)


@app.route("/run", methods=["POST"])
async def run(request: Request):
    """Runs the provided nodes"""
    # headers = {"Cache-Control": "no-cache"}
    # await request.respond(response="Run request accepted", status=200, headers=headers)
    queue = request.app.ctx.queue

    try:
        os.environ["killed"] = "False"
        if request.app.ctx.executor:
            logger.info("Resuming existing executor...")
            executor = request.app.ctx.executor
            await executor.resume()
        else:
            logger.info("Running new executor...")
            full_data = dict(request.json)  # type: ignore
            logger.info(full_data)
            nodes_list = full_data["data"]
            os.environ["device"] = "cpu" if full_data["isCpu"] else "cuda"
            os.environ["isFp16"] = str(full_data["isFp16"])
            logger.info(f"Using device: {os.environ['device']}")
            executor = Executor(nodes_list, app.loop, queue, app.ctx.cache.copy())
            request.app.ctx.executor = executor
            await executor.run()
        if not executor.paused:
            del request.app.ctx.executor
            request.app.ctx.executor = None
        if torch is not None:
            torch.cuda.empty_cache()
        gc.collect()
        await queue.put(
            {"event": "finish", "data": {"message": "Successfully ran nodes!"}}
        )
        return json({"message": "Successfully ran nodes!"}, status=200)
    except Exception as exception:
        logger.error(exception, exc_info=True)
        request.app.ctx.executor = None
        logger.error(traceback.format_exc())

        error = {
            "message": "Error running nodes!",
            "source": None,
            "exception": str(exception),
        }
        if isinstance(exception, NodeExecutionError):
            error["source"] = {
                "nodeId": exception.node["id"],
                "schemaId": exception.node["schemaId"],
            }

        await queue.put({"event": "execution-error", "data": error})
        return json(error, status=500)


@app.route("/run/individual", methods=["POST"])
async def run_individual(request: Request):
    """Runs a single node"""
    try:
        full_data = dict(request.json)  # type: ignore
        logger.info(full_data)
        os.environ["device"] = "cpu" if full_data["isCpu"] else "cuda"
        os.environ["isFp16"] = str(full_data["isFp16"])
        logger.info(f"Using device: {os.environ['device']}")
        # Create node based on given category/name information
        node_instance = NodeFactory.create_node(full_data["schemaId"])
        # Run the node and pass in inputs as args
        run_func = functools.partial(node_instance.run, *full_data["inputs"])
        output = await app.loop.run_in_executor(None, run_func)
        # Cache the output of the node
        app.ctx.cache[full_data["id"]] = output
        extra_data = node_instance.get_extra_data()
        del node_instance, run_func
        return json({"success": True, "data": extra_data})
    except Exception as exception:
        logger.error(exception, exc_info=True)
        return json({"success": False, "error": str(exception)})


@app.get("/sse")
async def sse(request: Request):
    headers = {"Cache-Control": "no-cache"}
    response = await request.respond(headers=headers, content_type="text/event-stream")
    while True:
        message = await request.app.ctx.queue.get()
        if not message:
            break
        if response is not None:
            await response.send(f"event: {message['event']}\n")
            await response.send(f"data: {stringify(message['data'])}\n\n")


@app.after_server_start
async def setup_queue(sanic_app: Sanic, _):
    sanic_app.ctx.queue = asyncio.Queue()


@app.route("/pause", methods=["POST"])
async def pause(request):
    """Pauses the current execution"""
    try:
        if request.app.ctx.executor:
            logger.info("Executor found. Attempting to pause...")
            await request.app.ctx.executor.pause()
            return json({"message": "Successfully paused execution!"}, status=200)
        logger.info("No executor to pause")
        return json({"message": "No executor to pause!"}, status=200)
    except Exception as exception:
        logger.log(2, exception, exc_info=True)
        return json(
            {"message": "Error pausing execution!", "exception": str(exception)},
            status=500,
        )


@app.route("/kill", methods=["POST"])
async def kill(request):
    """Kills the current execution"""
    try:
        if request.app.ctx.executor:
            logger.info("Executor found. Attempting to kill...")
            await request.app.ctx.executor.kill()
            request.app.ctx.executor = None
            return json({"message": "Successfully killed execution!"}, status=200)
        logger.info("No executor to kill")
        return json({"message": "No executor to kill!"}, status=200)
    except Exception as exception:
        logger.log(2, exception, exc_info=True)
        return json(
            {"message": "Error killing execution!", "exception": str(exception)},
            status=500,
        )


if __name__ == "__main__":
    try:
        port = int(sys.argv[1]) or 8000
    except:
        port = 8000

    if sys.argv[1] != "--no-run":
        app.run(port=port)
