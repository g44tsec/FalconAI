let currentTab = 0;
let chatHistory = loadChatHistoryFromLocalStorage() || [[]]; 

let recognition = null;

function changeTheme(theme) {
    const body = document.body;
    body.classList.remove('dark-purple-theme', 'bright-white-theme'); 

    if (theme === 'darkPurple') {
        body.classList.add('dark-purple-theme');
    } else if (theme === 'brightWhite') {
        body.classList.add('bright-white-theme');
    } else {
        body.classList.remove('dark-purple-theme', 'bright-white-theme');
    }
}

document.getElementById('preset-dark').addEventListener('click', () => changeTheme('dark'));
document.getElementById('preset-purple-yellow').addEventListener('click', () => changeTheme('darkPurple'));
document.getElementById('preset-white-pink').addEventListener('click', () => changeTheme('brightWhite'));

function initSpeechRecognition() { // this part is assisted by ai
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognition.onstart = () => {
            const micButton = document.getElementById('mic-button');
            micButton.textContent = '🔴'; 
            micButton.style.backgroundColor = '#FF6B6B';
        };

        recognition.onresult = (event) => {
            const userInput = document.getElementById('user-input');
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;

            const micButton = document.getElementById('mic-button');
            micButton.textContent = '🎤';
            micButton.style.backgroundColor = '';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            const micButton = document.getElementById('mic-button');
            micButton.textContent = '🎤';
            micButton.style.backgroundColor = '';
            alert(`Speech recognition error: ${event.error}`);
        };

        recognition.onend = () => {
            const micButton = document.getElementById('mic-button');
            micButton.textContent = '🎤';
            micButton.style.backgroundColor = '';
        };
    } else {
        alert('Speech recognition not supported in this browser');
    }
} // the assistance by ai is done for this part 

function estimateTokens(text) {

    return Math.ceil(text.length / 4);
}

function truncateChatHistory(messages, maxTokens = 3000) { // needed some help from ai for this with saving chat history etc
    let totalTokens = 0;
    const truncatedMessages = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const messageTokens = estimateTokens(messages[i].content);
        if (totalTokens + messageTokens > maxTokens) {
            break;
        }
        truncatedMessages.unshift(messages[i]);
        totalTokens += messageTokens;
    }

    return truncatedMessages;
}

async function askOpenAI(question, fileBase64 = null) {
    try {

        const currentChatHistory = chatHistory[currentTab] || [];

        const messages = [
            { role: 'system', content: 'You are a helpful assistant. Remember the context of our conversation.' }
        ];

        const contextMessages = currentChatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        const truncatedContext = truncateChatHistory(contextMessages);
        messages.push(...truncatedContext);

        messages.push({ role: 'user', content: question });

        const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

        if (totalTokens > 4000) { 

            const continueChat = confirm('This conversation has become too long. Do you want to start a new chat or continue and potentially lose some context?');

            if (!continueChat) {
                createNewTab(); 
                return 'Started a new chat. Please resend your last message.';
            }
        }

        const formData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages,
            max_tokens: 3000,
            temperature: 0.7,
            top_p: 0.9
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', { // api
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'API KEY HERE' // OPEN AI API KEY GOES HERE SUPPORT FOR LLAMA 3 NOT AVAILABLE IN THIS PROJECT DUE TO GPU LIMITATIONS
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0].message && data.choices[0].message.content) {
            return data.choices[0].message.content.trim();
        } else {
            throw new Error('Invalid response structure');
        }
    } catch (error) {
        console.error('Error:', error.message);
        return `Error: ${error.message}`;
    }
}

function formatMathAndCode(text) {

    let formatted = text.replace(/\$\$(.*?)\$\$/g, (match, math) => {
        return `<span class="math-block">${math}</span>`; 
    }).replace(/\$(.*?)\$/g, (match, math) => {
        return `<span class="math">${math}</span>`; 
    });

    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const headerId = `code-header-${Math.random().toString(36).substr(2, 9)}`;
        const canvasId = `canvas-${Math.random().toString(36).substr(2, 9)}`;

        const header = `<div class="code-header" id="${headerId}">
            <span class="code-label">${language || "Code"}</span>
            <button class="render-canvas-button" data-target="${canvasId}" data-code="${encodeURIComponent(code.trim())}">
                Edit/Render
            </button>
        </div>`;

        return `<div class="code-block">
            ${header}
            <pre><code class="language-${language}">${code.trim()}</code></pre>
            <canvas id="${canvasId}" width="400" height="300" style="display:none; max-width:100%;"></canvas>
        </div>`;
    });

    formatted = formatted.replace(/`(.*?)`/g, (match, inlineCode) => {
        return `<code>${inlineCode.trim()}</code>`;
    });

    formatted = formatted.replace(/^### (.*$)/gm, "<h3>$1</h3>")  
                         .replace(/^#### (.*$)/gm, "<h4>$1</h4>") 
                         .replace(/^## (.*$)/gm, "<h2>$1</h2>")   
                         .replace(/^# (.*$)/gm, "<h1>$1</h1>")    
                         .replace(/^\* (.*$)/gm, "<ul><li>$1</li></ul>") 
                         .replace(/^> (.*$)/gm, "<blockquote>$1</blockquote>"); // this part of the variable formatted was done wiht ai 

    return formatted.split('\n').map((line) => {
        if (line.startsWith("<h") || line.startsWith("<ul>") || line.startsWith("<blockquote>") || line.startsWith("<div>")) {
            return line; 
        } else if (line.trim().length > 0) {
            return `<p>${line.trim()}</p>`; 
        }
        return ''; 
    }).join('');
}

function sendMessage() {
    const inputField = document.getElementById('user-input');
    const question = inputField.value.trim();

    if (question) {
        addMessage('user', question);
        saveChatMessage('user', question);
        inputField.value = '';

        addMessage('ai', 'Assisting...');
        askOpenAI(question).then((answer) => {
            const formattedAnswer = formatMathAndCode(answer);
            updateLastMessage('ai', formattedAnswer);
            saveChatMessage('ai', formattedAnswer);
        });
    }
}

function askQuestion(question) {
    const inputField = document.getElementById('user-input');
    inputField.value = question; 

    sendMessage();
}

document.getElementById('send-button').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

document.getElementById('mic-button').addEventListener('click', () => {
    if (recognition) {
        recognition.start();
    } else {
        initSpeechRecognition();
        recognition.start();
    }
});

function setupCanvasRendering() { //help with ai 
    document.addEventListener('click', function(event) {
        const renderButton = event.target.closest('.render-canvas-button');
        if (renderButton) {
            const canvasId = renderButton.getAttribute('data-target');
            const encodedCode = renderButton.getAttribute('data-code');
            const code = decodeURIComponent(encodedCode);

            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'canvas-modal';
            canvasContainer.innerHTML = `
                <div class="canvas-modal-content">
                    <div class="canvas-modal-header">
                        <h3>Code Editor</h3>
                        <button class="canvas-close-btn">✖</button>
                    </div>
                    <div class="canvas-controls">
                        <textarea class="canvas-code-editor">${code}</textarea>
                        <button class="canvas-edit-btn">Save Changes</button>
                    </div>
                </div>
            `;

            document.body.appendChild(canvasContainer);

            canvasContainer.querySelector('.canvas-close-btn').addEventListener('click', () => {
                document.body.removeChild(canvasContainer);
            });

            const editBtn = canvasContainer.querySelector('.canvas-edit-btn');
            const codeEditor = canvasContainer.querySelector('.canvas-code-editor');

            editBtn.addEventListener('click', () => {
                const updatedCode = codeEditor.value.trim();
                alert('Changes saved! Updated code:\n' + updatedCode);

            });
        }
    });
} // this part is done with help from ai 
const style = document.createElement('style');
style.textContent = `
    .canvas-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .canvas-modal-content {
        background: #2e2e2e;
        border-radius: 10px;
        padding: 20px;
        width: 80%;
        max-width: 800px;
        max-height: 90%;
        display: flex;
        flex-direction: column;
    }

    .canvas-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .canvas-wrapper {
        display: flex;
        justify-content: center;
        margin-bottom: 15px;
    }

    .canvas-wrapper canvas {
        border: 2px solid #444;
        background: white;
    }

    .canvas-controls {
        display: flex;
        justify-content: center;
        gap: 10px;
    }

    .canvas-controls button {
        padding: 10px 15px;
        background: #565656;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    }

    .canvas-code-editor {
        width: 100%;
        height: 200px;
        margin-top: 15px;
        background: #444;
        color: white;
        font-family: monospace;
        padding: 10px;
        border: none;
        border-radius: 5px;
    }
`;
document.head.appendChild(style);

setupCanvasRendering();

document.getElementById('file-upload').addEventListener('change', function() {

    console.log('File upload is currently disabled');
    this.value = ''; 
    alert('File upload is currently unavailable.'); 
});

function switchTab(tabIndex) {
    if (tabIndex < chatHistory.length) {
        currentTab = tabIndex;

        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });

        const activeButton = document.querySelector(`.tab-button[data-tab-index="${tabIndex}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }

        loadChatHistory();
    }
}

document.getElementById('toolbar').querySelector('button').onclick = createNewTab;

function createNewTab() {
    const newTabIndex = chatHistory.length;
    chatHistory.push([]); 

    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-button-container';

    const tabButton = document.createElement('button');
    tabButton.className = 'tab-button';
    tabButton.textContent = `Chat ${newTabIndex + 1}`;
    tabButton.setAttribute('data-tab-index', newTabIndex);
    tabButton.onclick = () => switchTab(newTabIndex);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-tab-button';
    deleteButton.innerHTML = '✖';
    deleteButton.onclick = (e) => {
        e.stopPropagation(); 
        deleteCurrentTab(newTabIndex);
    };

    tabContainer.appendChild(tabButton);
    tabContainer.appendChild(deleteButton);

    document.getElementById('toolbar').appendChild(tabContainer);

    switchTab(newTabIndex);

    saveChatHistoryToLocalStorage();
}

function saveChatMessage(role, content) {
    chatHistory[currentTab].push({ role, content });
    saveChatHistoryToLocalStorage(); 
}

function loadChatHistory() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    chatHistory[currentTab].forEach((message) => {
        addMessage(message.role, message.content);
    });
}

function adjustChatHeight() {
    const chatBox = document.getElementById('chat-box');
    chatBox.scrollTop = chatBox.scrollHeight; 
}

function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = content;
    document.getElementById('messages').appendChild(messageDiv);
    adjustChatHeight(); 
}

function updateLastMessage(role, content) {
    const messages = document.querySelectorAll(`.message.${role}`);
    if (messages.length > 0) {
        messages[messages.length - 1].innerHTML = content;
    }
}

function saveChatHistoryToLocalStorage() {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory)); // helped with ai
}

function loadChatHistoryFromLocalStorage() {
    const savedHistory = localStorage.getItem('chatHistory');
    return savedHistory ? JSON.parse(savedHistory) : null;
}

function deleteCurrentTab(tabIndex) {

    if (chatHistory.length <= 1) {
        alert("Cannot delete the last chat tab.");
        return;
    }

    chatHistory.splice(tabIndex, 1);

    const tabButtonContainer = document.querySelector(`.tab-button-container button[data-tab-index="${tabIndex}"]`).closest('.tab-button-container');
    tabButtonContainer.remove();

    document.querySelectorAll('.tab-button').forEach((button, index) => {
        button.textContent = `Chat ${index + 1}`;
        button.setAttribute('data-tab-index', index);
    });

    switchTab(Math.min(currentTab, chatHistory.length - 1));

    saveChatHistoryToLocalStorage();
}

initSpeechRecognition();
setupCanvasRendering();