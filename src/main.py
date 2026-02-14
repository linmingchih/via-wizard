import argparse
import json
import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from api import ViaWizardAPI


def create_web_handler(api, gui_dir):
    class ViaWizardWebHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=gui_dir, **kwargs)

        def _send_json(self, status_code, payload):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, file_path, download_name):
            with open(file_path, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
                payload = json.loads(raw_body.decode("utf-8"))
            except Exception as exc:
                self._send_json(400, {"success": False, "error": f"Invalid JSON payload: {exc}"})
                return

            if self.path == "/api/parse_stackup_xml_content":
                xml_content = payload.get("xmlContent", "")
                result = api.parse_stackup_xml_content(xml_content)
                self._send_json(200, {"success": True, "result": result})
                return

            if self.path == "/api/export_aedb":
                data = payload.get("projectData", {})
                version = payload.get("version", "2024.1")
                output_dir = payload.get("outputDir")
                project_name = payload.get("projectName")
                result = api.export_aedb_web(data, version, output_dir=output_dir, project_name=project_name)
                if result.get("success") and result.get("zipPath") and os.path.exists(result["zipPath"]):
                    self._send_file(result["zipPath"], result.get("zipName", "project.aedb.zip"))
                else:
                    self._send_json(500, result)
                return

            self._send_json(404, {"success": False, "error": f"Unknown endpoint: {self.path}"})

        def do_GET(self):
            if self.path == "/api/default_stackup":
                stack_path = os.path.join(os.path.dirname(__file__), "stack.xml")
                if os.path.exists(stack_path):
                    result = api.parse_stackup_xml(stack_path)
                else:
                    result = api.get_stackup_data()
                self._send_json(200, {"success": True, "result": result})
                return
            return super().do_GET()

    return ViaWizardWebHandler


def run_pywebview():
    import webview

    api = ViaWizardAPI()
    gui_dir = os.path.join(os.path.dirname(__file__), "gui")
    index_path = os.path.join(gui_dir, "index.html")

    window = webview.create_window(
        "Via Wizard",
        url=f"file://{index_path}",
        width=1200,
        height=800,
        js_api=api,
    )

    api.set_window(window)
    webview.start(debug=False)


def run_webgui(host, port):
    api = ViaWizardAPI()
    gui_dir = os.path.join(os.path.dirname(__file__), "gui")
    handler = create_web_handler(api, gui_dir)

    server = ThreadingHTTPServer((host, port), handler)
    url = f"http://{host}:{port}/index.html"
    print(f"Starting web GUI server at {url}")
    webbrowser.open(url)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["web", "desktop"], default="desktop", help="Launch mode.")
    parser.add_argument("--webgui", action="store_true", help="Legacy flag. Same as --mode web.")
    parser.add_argument("--host", default="127.0.0.1", help="Host for browser mode.")
    parser.add_argument("--port", type=int, default=8080, help="Port for browser mode.")
    args = parser.parse_args()

    launch_mode = "web" if args.webgui else args.mode
    if launch_mode == "web":
        run_webgui(args.host, args.port)
    else:
        run_pywebview()


if __name__ == "__main__":
    main()
