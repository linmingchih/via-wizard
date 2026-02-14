
import { addMessage } from './utils.js';

function isPywebviewMode() {
    return Boolean(window.pywebview && window.pywebview.api);
}

function pickFile(accept) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
        input.click();
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function parseFilenameFromDisposition(disposition, fallbackName) {
    if (!disposition) return fallbackName;
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return match && match[1] ? match[1] : fallbackName;
}

export const api = {
    async openFile() {
        if (isPywebviewMode()) {
            try {
                const data = await window.pywebview.api.open_file_dialog();
                return data;
            } catch (error) {
                addMessage(`Error in openFile: ${error}`);
                console.error(error);
                throw error;
            }
        }

        const file = await pickFile('.xml,.XML,text/xml,.txt');
        if (!file) return null;
        const content = await readFileAsText(file);
        return { name: file.name, content };
    },

    async parseStackupXml(path) {
        if (isPywebviewMode()) {
            return await window.pywebview.api.parse_stackup_xml(path);
        }
        if (!path) return null;
        if (typeof path === 'object' && path.content) {
            return await this.parseStackupXmlContent(path.content);
        }
        return null;
    },

    async parseStackupXmlContent(xmlContent) {
        if (isPywebviewMode()) {
            return await window.pywebview.api.parse_stackup_xml_content(xmlContent);
        }

        const response = await fetch('/api/parse_stackup_xml_content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ xmlContent })
        });
        const payload = await response.json();
        return payload.result;
    },

    async saveStackup(path, stackup) {
        if (isPywebviewMode()) {
            await window.pywebview.api.save_stackup_xml(path, stackup);
            return;
        }
        addMessage('Save stackup XML is only supported in pywebview mode.');
    },

    async saveProject(projectData) {
        if (isPywebviewMode()) {
            await window.pywebview.api.save_project(projectData);
            return;
        }
        downloadJson('project.json', projectData);
        addMessage('Project JSON downloaded.');
    },

    async loadProject() {
        if (isPywebviewMode()) {
            return await window.pywebview.api.load_project();
        }

        const file = await pickFile('.json,.JSON,application/json');
        if (!file) return null;
        const content = await readFileAsText(file);
        return JSON.parse(content);
    },

    async exportAEDB(projectData, version) {
        if (isPywebviewMode()) {
            await window.pywebview.api.export_aedb(projectData, version);
            return;
        }

        const projectName = prompt('Project name (used as output file base name):', 'project');
        if (projectName === null) return;

        const response = await fetch('/api/export_aedb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectData,
                version,
                projectName: projectName || 'project'
            })
        });
        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const isZipLike = contentType.includes('application/zip') || contentType.includes('application/x-zip-compressed');

        if (response.ok && (isZipLike || !isJson)) {
            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition');
            const filename = parseFilenameFromDisposition(disposition, `${projectName || 'project'}.aedb.zip`);
            triggerDownload(blob, filename);
            return { success: true, aedbPath: `Downloaded ${filename}` };
        }

        let errorPayload = null;
        try {
            errorPayload = isJson ? await response.json() : { error: `HTTP ${response.status}` };
        } catch {
            errorPayload = { error: `HTTP ${response.status}` };
        }
        if (response.ok && errorPayload && errorPayload.success) {
            return errorPayload;
        }
        return { success: false, error: errorPayload.error || `HTTP ${response.status}` };
    },

    async exitApp() {
        if (isPywebviewMode()) {
            await window.pywebview.api.exit_app();
            return;
        }
        addMessage('Exit is only available in pywebview mode. Close this browser tab to exit UI.');
    },

    async loadDefaultStackup() {
        if (isPywebviewMode()) {
            return await window.pywebview.api.parse_stackup_xml('stack.xml');
        }
        const response = await fetch('/api/default_stackup');
        const payload = await response.json();
        return payload.result;
    }
};
