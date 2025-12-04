
export function addMessage(msg) {
    const msgBody = document.getElementById('message-body');
    if (!msgBody) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    msgBody.appendChild(entry);
    msgBody.scrollTop = msgBody.scrollHeight;

    if (window.pywebview) {
        console.log(msg);
    }
}

export function clearMessages() {
    const msgBody = document.getElementById('message-body');
    if (msgBody) msgBody.innerHTML = '';
}

export function copyMessages() {
    const msgBody = document.getElementById('message-body');
    if (!msgBody) return;
    const text = msgBody.innerText;
    navigator.clipboard.writeText(text).then(() => {
        addMessage("Messages copied to clipboard.");
    }).catch(err => {
        addMessage("Failed to copy messages: " + err);
    });
}

export function toggleMessageWindow() {
    const msgWindow = document.getElementById('message-window');
    if (!msgWindow) return;

    // We can also update state here if we import it, but for UI toggles it's often simpler to just check class
    if (msgWindow.classList.contains('hidden')) {
        msgWindow.classList.remove('hidden');
    } else {
        msgWindow.classList.add('hidden');
    }
}
