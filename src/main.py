import webview
import os
from api import ViaWizardAPI

def main():
    api = ViaWizardAPI()
    
    # Get absolute path to index.html
    gui_dir = os.path.join(os.path.dirname(__file__), 'gui')
    index_path = os.path.join(gui_dir, 'index.html')
    
    window = webview.create_window(
        'Via Wizard', 
        url=f'file://{index_path}',
        width=1200,
        height=800,
        js_api=api
    )
    
    api.set_window(window)
    webview.start(debug=True)

if __name__ == "__main__":
    main()
