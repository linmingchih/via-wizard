
import { addMessage } from './utils.js';

export const api = {
    async openFile() {
        if (window.pywebview) {
            try {
                const data = await window.pywebview.api.open_file_dialog();
                return data;
            } catch (error) {
                addMessage(`Error in openFile: ${error}`);
                console.error(error);
                throw error;
            }
        }
        return null;
    },

    async parseStackupXml(path) {
        if (window.pywebview) {
            return await window.pywebview.api.parse_stackup_xml(path);
        }
        return null;
    },

    async saveStackup(path, stackup) {
        if (window.pywebview) {
            await window.pywebview.api.save_stackup_xml(path, stackup);
        }
    },

    async saveProject(projectData) {
        if (window.pywebview) {
            await window.pywebview.api.save_project(projectData);
        }
    },

    async loadProject() {
        if (window.pywebview) {
            return await window.pywebview.api.load_project();
        }
        return null;
    },

    async exportAEDB(projectData, version) {
        if (window.pywebview) {
            await window.pywebview.api.export_aedb(projectData, version);
        }
    },

    async exitApp() {
        if (window.pywebview) {
            await window.pywebview.api.exit_app();
        }
    }
};
