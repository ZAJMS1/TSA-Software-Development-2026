/**
 * AccessiBridge - Main JavaScript
 * Accessibility-focused web application
 */

// ========================================
// Speech Recognition Setup
// ========================================

class SpeechRecognitionManager {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onResult = null;
        this.onEnd = null;
        this.continuous = false;

        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (this.onResult) {
                this.onResult(finalTranscript, interimTranscript);
            }
        };

        this.recognition.onend = () => {
            if (this.continuous && this.isListening) {
                this.recognition.start();
            } else {
                this.isListening = false;
                if (this.onEnd) {
                    this.onEnd();
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error !== 'no-speech') {
                this.isListening = false;
            }
        };
    }

    isSupported() {
        return !!this.recognition;
    }

    start(continuous = false) {
        if (!this.recognition) return false;
        this.continuous = continuous;
        this.isListening = true;
        this.recognition.continuous = continuous;
        this.recognition.start();
        return true;
    }

    stop() {
        if (!this.recognition) return;
        this.continuous = false;
        this.isListening = false;
        this.recognition.stop();
    }
}

// ========================================
// Text-to-Speech Setup
// ========================================

class TextToSpeechManager {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.currentUtterance = null;
        this.isPaused = false;

        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
    }

    getVoices() {
        return this.voices;
    }

    speak(text, options = {}) {
        if (!text) return;

        // Cancel any current speech
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Apply options
        utterance.rate = options.rate || 1;
        utterance.pitch = options.pitch || 1;
        utterance.volume = options.volume || 1;

        if (options.voice) {
            utterance.voice = this.voices.find(v => v.name === options.voice) || null;
        }

        // Event handlers
        utterance.onstart = () => {
            this.currentUtterance = utterance;
            if (options.onStart) options.onStart();
        };

        utterance.onend = () => {
            this.currentUtterance = null;
            this.isPaused = false;
            if (options.onEnd) options.onEnd();
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            if (options.onError) options.onError(event);
        };

        this.synth.speak(utterance);
    }

    pause() {
        this.synth.pause();
        this.isPaused = true;
    }

    resume() {
        this.synth.resume();
        this.isPaused = false;
    }

    stop() {
        this.synth.cancel();
        this.currentUtterance = null;
        this.isPaused = false;
    }

    isSpeaking() {
        return this.synth.speaking;
    }
}

// ========================================
// Visual Alert System
// ========================================

class VisualAlertSystem {
    constructor() {
        this.alertElement = document.createElement('div');
        this.alertElement.className = 'visual-alert';
        this.alertElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.alertElement);
    }

    flash(color = null) {
        if (color) {
            this.alertElement.style.background = color;
        }
        this.alertElement.classList.remove('flash');
        void this.alertElement.offsetWidth; // Trigger reflow
        this.alertElement.classList.add('flash');

        // Vibration API for haptic feedback
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
    }

    flashPattern(pattern = [100, 50, 100]) {
        pattern.forEach((duration, index) => {
            setTimeout(() => {
                this.flash();
            }, pattern.slice(0, index).reduce((a, b) => a + b, 0) + (index * 100));
        });

        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    }
}

// ========================================
// API Helpers
// ========================================

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {}
    };

    if (data instanceof FormData) {
        options.body = data;
    } else if (data) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'API request failed');
        }

        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ========================================
// Global Instances
// ========================================

const speechRecognition = new SpeechRecognitionManager();
const textToSpeech = new TextToSpeechManager();
const visualAlert = new VisualAlertSystem();

// ========================================
// Utility Functions
// ========================================

function showStatus(container, message, type = 'info') {
    const statusEl = document.createElement('div');
    statusEl.className = `status status-${type}`;
    statusEl.setAttribute('role', 'alert');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = message;

    container.insertAdjacentElement('afterbegin', statusEl);

    // Auto-remove after 5 seconds
    setTimeout(() => statusEl.remove(), 5000);
}

function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

function formatTime(date) {
    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

// ========================================
// Drag and Drop Helper
// ========================================

function setupDragAndDrop(dropZone, fileInput, onFileSelect) {
    if (!dropZone || !fileInput) return;

    // Prevent default drag behaviors on document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // Create a new DataTransfer to set files on the input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(files[0]);
            fileInput.files = dataTransfer.files;

            // Trigger change event
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            // Call optional callback
            if (onFileSelect) {
                onFileSelect(files[0]);
            }
        }
    });
}

// ========================================
// Page Initializers
// ========================================

// Image Describer Page
function initImageDescriber() {
    const form = document.getElementById('image-form');
    const fileInput = document.getElementById('image-input');
    const fileLabel = document.querySelector('.file-input-label');
    const preview = document.getElementById('image-preview');
    const output = document.getElementById('description-output');
    const speakBtn = document.getElementById('speak-description');
    const saveBtn = document.getElementById('save-description');

    if (!form) return;

    // Setup drag and drop
    setupDragAndDrop(fileLabel, fileInput);

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.classList.remove('hidden');
                fileLabel.querySelector('.file-name').textContent = file.name;
            };
            reader.readAsDataURL(file);
            announceToScreenReader(`Selected file: ${file.name}`);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            showStatus(form, 'Please select an image first', 'warning');
            return;
        }

        const mode = document.querySelector('input[name="mode"]:checked').value;
        const formData = new FormData();
        formData.append('image', file);
        formData.append('mode', mode);

        output.innerHTML = '<div class="loading"><span class="spinner"></span> Analyzing image...</div>';
        announceToScreenReader('Analyzing image, please wait');

        try {
            const result = await apiCall('/api/describe-image', 'POST', formData);
            output.textContent = result.description;
            announceToScreenReader('Image description ready');

            // Enable action buttons
            speakBtn.disabled = false;
            saveBtn.disabled = false;

            // Flash to indicate completion
            visualAlert.flash('#16a34a');
        } catch (error) {
            output.textContent = 'Error: ' + error.message;
            showStatus(form, error.message, 'error');
        }
    });

    speakBtn.addEventListener('click', () => {
        const text = output.textContent;
        if (text && text !== output.dataset.placeholder) {
            if (textToSpeech.isSpeaking()) {
                textToSpeech.stop();
                speakBtn.innerHTML = '<i class="bi bi-volume-up" aria-hidden="true"></i> Read Aloud';
            } else {
                textToSpeech.speak(text, {
                    onStart: () => speakBtn.innerHTML = '<i class="bi bi-stop-fill" aria-hidden="true"></i> Stop',
                    onEnd: () => speakBtn.innerHTML = '<i class="bi bi-volume-up" aria-hidden="true"></i> Read Aloud'
                });
            }
        }
    });

    saveBtn.addEventListener('click', async () => {
        const text = output.textContent;
        if (text) {
            try {
                await apiCall('/api/save-text', 'POST', {
                    title: 'Image Description',
                    content: text,
                    category: 'description'
                });
                showStatus(form, 'Description saved!', 'success');
            } catch (error) {
                showStatus(form, 'Failed to save', 'error');
            }
        }
    });
}

// Speech to Text Page
function initSpeechToText() {
    const startBtn = document.getElementById('start-recording');
    const stopBtn = document.getElementById('stop-recording');
    const output = document.getElementById('transcription-output');
    const interim = document.getElementById('interim-output');
    const saveBtn = document.getElementById('save-transcription');
    const clearBtn = document.getElementById('clear-transcription');
    const recordingIndicator = document.querySelector('.recording-indicator');

    if (!startBtn || !speechRecognition.isSupported()) {
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Speech Recognition Not Supported';
        }
        return;
    }

    let fullTranscript = '';

    speechRecognition.onResult = (final, interimText) => {
        if (final) {
            fullTranscript += final + ' ';
            output.textContent = fullTranscript;
        }
        if (interim) {
            interim.textContent = interimText;
        }
    };

    speechRecognition.onEnd = () => {
        recordingIndicator.classList.remove('active');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    };

    startBtn.addEventListener('click', () => {
        if (speechRecognition.start(true)) {
            recordingIndicator.classList.add('active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            announceToScreenReader('Recording started');
            visualAlert.flash('#dc2626');
        }
    });

    stopBtn.addEventListener('click', () => {
        speechRecognition.stop();
        announceToScreenReader('Recording stopped');
    });

    saveBtn.addEventListener('click', async () => {
        if (fullTranscript.trim()) {
            try {
                await apiCall('/api/save-transcription', 'POST', {
                    text: fullTranscript.trim(),
                    source: 'speech'
                });
                showStatus(document.querySelector('main'), 'Transcription saved!', 'success');
            } catch (error) {
                showStatus(document.querySelector('main'), 'Failed to save', 'error');
            }
        }
    });

    clearBtn.addEventListener('click', () => {
        fullTranscript = '';
        output.textContent = '';
        if (interim) interim.textContent = '';
        announceToScreenReader('Transcription cleared');
    });
}

// Text to Speech Page
function initTextToSpeech() {
    const textInput = document.getElementById('text-input');
    const speakBtn = document.getElementById('speak-text');
    const pauseBtn = document.getElementById('pause-text');
    const stopBtn = document.getElementById('stop-text');
    const voiceSelect = document.getElementById('voice-select');
    const rateSlider = document.getElementById('rate-slider');
    const pitchSlider = document.getElementById('pitch-slider');
    const rateValue = document.getElementById('rate-value');
    const pitchValue = document.getElementById('pitch-value');

    if (!speakBtn) return;

    // Populate voices
    function populateVoices() {
        const voices = textToSpeech.getVoices();
        voiceSelect.innerHTML = '<option value="">Default Voice</option>';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
    }

    populateVoices();
    setTimeout(populateVoices, 500); // Retry after voices load

    rateSlider.addEventListener('input', () => {
        rateValue.textContent = rateSlider.value;
    });

    pitchSlider.addEventListener('input', () => {
        pitchValue.textContent = pitchSlider.value;
    });

    speakBtn.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (!text) {
            showStatus(document.querySelector('main'), 'Please enter some text first', 'warning');
            return;
        }

        textToSpeech.speak(text, {
            voice: voiceSelect.value,
            rate: parseFloat(rateSlider.value),
            pitch: parseFloat(pitchSlider.value),
            onStart: () => {
                speakBtn.disabled = true;
                pauseBtn.disabled = false;
                stopBtn.disabled = false;
            },
            onEnd: () => {
                speakBtn.disabled = false;
                pauseBtn.disabled = true;
                stopBtn.disabled = true;
                pauseBtn.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i> Pause';
            }
        });
    });

    pauseBtn.addEventListener('click', () => {
        if (textToSpeech.isPaused) {
            textToSpeech.resume();
            pauseBtn.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i> Pause';
        } else {
            textToSpeech.pause();
            pauseBtn.innerHTML = '<i class="bi bi-play-fill" aria-hidden="true"></i> Resume';
        }
    });

    stopBtn.addEventListener('click', () => {
        textToSpeech.stop();
        speakBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
    });
}

// Communication Bridge Page
function initCommunicationBridge() {
    const conversationArea = document.getElementById('conversation-area');
    const hearingInput = document.getElementById('hearing-input');
    const deafInput = document.getElementById('deaf-input');
    const hearingSendBtn = document.getElementById('hearing-send');
    const deafSendBtn = document.getElementById('deaf-send');
    const hearingMicBtn = document.getElementById('hearing-mic');
    const clearBtn = document.getElementById('clear-conversation');

    if (!conversationArea) return;

    const sessionId = 'session_' + Date.now();
    let autoSpeak = document.getElementById('auto-speak')?.checked ?? true;
    let autoFlash = document.getElementById('auto-flash')?.checked ?? true;

    document.getElementById('auto-speak')?.addEventListener('change', (e) => {
        autoSpeak = e.target.checked;
    });

    document.getElementById('auto-flash')?.addEventListener('change', (e) => {
        autoFlash = e.target.checked;
    });

    function addMessage(speaker, message) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${speaker}`;
        msgEl.innerHTML = `
            <div class="message-label">${speaker === 'hearing' ? 'Hearing Person' : 'Deaf Person'}</div>
            <div class="message-text">${message}</div>
            <div class="message-time">${formatTime(new Date())}</div>
        `;
        conversationArea.appendChild(msgEl);
        conversationArea.scrollTop = conversationArea.scrollHeight;

        // Auto-speak for deaf user's messages (so hearing person can hear)
        if (speaker === 'deaf' && autoSpeak) {
            textToSpeech.speak(message);
        }

        // Visual flash for hearing person's messages (so deaf person notices)
        if (speaker === 'hearing' && autoFlash) {
            visualAlert.flashPattern([100, 50, 100]);
        }

        // Save to history
        apiCall('/api/conversation', 'POST', {
            session_id: sessionId,
            speaker,
            message,
            message_type: 'text'
        }).catch(console.error);
    }

    hearingSendBtn.addEventListener('click', () => {
        const message = hearingInput.value.trim();
        if (message) {
            addMessage('hearing', message);
            hearingInput.value = '';
        }
    });

    hearingInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            hearingSendBtn.click();
        }
    });

    deafSendBtn.addEventListener('click', () => {
        const message = deafInput.value.trim();
        if (message) {
            addMessage('deaf', message);
            deafInput.value = '';
        }
    });

    deafInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            deafSendBtn.click();
        }
    });

    // Voice input for hearing person
    if (hearingMicBtn && speechRecognition.isSupported()) {
        let isRecording = false;

        speechRecognition.onResult = (final) => {
            if (final) {
                hearingInput.value += final;
            }
        };

        hearingMicBtn.addEventListener('click', () => {
            if (isRecording) {
                speechRecognition.stop();
                hearingMicBtn.innerHTML = '<i class="bi bi-mic"></i>';
                hearingMicBtn.setAttribute('aria-label', 'Start voice input');
                isRecording = false;
            } else {
                speechRecognition.start(true);
                hearingMicBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
                hearingMicBtn.setAttribute('aria-label', 'Stop voice input');
                isRecording = true;
            }
        });
    }

    clearBtn?.addEventListener('click', () => {
        conversationArea.innerHTML = '';
        announceToScreenReader('Conversation cleared');
    });
}

// Document Reader Page
function initDocumentReader() {
    const form = document.getElementById('document-form');
    const fileInput = document.getElementById('document-input');
    const fileLabel = form?.querySelector('.file-input-label');
    const output = document.getElementById('document-output');
    const speakBtn = document.getElementById('speak-document');
    const simplifyBtn = document.getElementById('simplify-document');

    if (!form) return;

    // Setup drag and drop
    setupDragAndDrop(fileLabel, fileInput);

    // Update file name display on change
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file && fileLabel) {
            const fileNameSpan = fileLabel.querySelector('.file-name');
            if (fileNameSpan) {
                fileNameSpan.textContent = file.name;
            }
            announceToScreenReader(`Selected file: ${file.name}`);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            showStatus(form, 'Please select a document', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('document', file);

        output.innerHTML = '<div class="loading"><span class="spinner"></span> Extracting text...</div>';

        try {
            const result = await apiCall('/api/extract-document', 'POST', formData);
            output.textContent = result.text;
            speakBtn.disabled = false;
            if (simplifyBtn) simplifyBtn.disabled = false;
            announceToScreenReader('Document text extracted');
        } catch (error) {
            output.textContent = 'Error: ' + error.message;
            showStatus(form, error.message, 'error');
        }
    });

    speakBtn?.addEventListener('click', () => {
        const text = output.textContent;
        if (text) {
            if (textToSpeech.isSpeaking()) {
                textToSpeech.stop();
                speakBtn.innerHTML = '<i class="bi bi-volume-up" aria-hidden="true"></i> Read Aloud';
            } else {
                textToSpeech.speak(text, {
                    onStart: () => speakBtn.innerHTML = '<i class="bi bi-stop-fill" aria-hidden="true"></i> Stop',
                    onEnd: () => speakBtn.innerHTML = '<i class="bi bi-volume-up" aria-hidden="true"></i> Read Aloud'
                });
            }
        }
    });

    simplifyBtn?.addEventListener('click', async () => {
        const text = output.textContent;
        if (!text) return;

        output.innerHTML = '<div class="loading"><span class="spinner"></span> Simplifying text...</div>';

        try {
            const result = await apiCall('/api/simplify-text', 'POST', { text });
            output.textContent = result.simplified;
            announceToScreenReader('Text has been simplified');
        } catch (error) {
            output.textContent = text; // Restore original
            showStatus(form, 'Could not simplify text: ' + error.message, 'error');
        }
    });
}

// Saved Content Page
function initSavedContent() {
    const deleteButtons = document.querySelectorAll('.delete-item');

    // Map table names to tab panel IDs
    const tableToPanel = {
        'image_descriptions': 'descriptions-panel',
        'transcriptions': 'transcriptions-panel',
        'saved_texts': 'texts-panel'
    };

    // Function to update tab counts
    function updateTabCount(table) {
        const panelId = tableToPanel[table];
        if (!panelId) return;

        const panel = document.getElementById(panelId);
        const tab = document.querySelector(`[data-tab="${panelId}"]`);

        if (panel && tab) {
            const itemCount = panel.querySelectorAll('.saved-item').length;
            const tabText = tab.textContent.replace(/\(\d+\)/, `(${itemCount})`);
            tab.textContent = tabText;
        }
    }

    deleteButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const table = btn.dataset.table;
            const id = btn.dataset.id;

            if (confirm('Are you sure you want to delete this item?')) {
                try {
                    await apiCall(`/api/delete/${table}/${id}`, 'DELETE');
                    btn.closest('.saved-item').remove();
                    updateTabCount(table);
                    showStatus(document.querySelector('main'), 'Item deleted', 'success');
                } catch (error) {
                    showStatus(document.querySelector('main'), 'Failed to delete', 'error');
                }
            }
        });
    });

    // Speak buttons for saved items
    document.querySelectorAll('.speak-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.text;
            if (textToSpeech.isSpeaking()) {
                textToSpeech.stop();
            } else {
                textToSpeech.speak(text);
            }
        });
    });
}

// ========================================
// Tab System
// ========================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(targetId)?.classList.add('active');
        });
    });
}

// ========================================
// Keyboard Navigation
// ========================================

document.addEventListener('keydown', (e) => {
    // Escape to stop any ongoing speech
    if (e.key === 'Escape') {
        textToSpeech.stop();
        speechRecognition.stop();
    }

    // Alt + S to toggle speech
    if (e.altKey && e.key === 's') {
        e.preventDefault();
        if (textToSpeech.isSpeaking()) {
            textToSpeech.stop();
        }
    }
});

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all page-specific functionality
    initImageDescriber();
    initSpeechToText();
    initTextToSpeech();
    initCommunicationBridge();
    initDocumentReader();
    initSavedContent();
    initTabs();

    // Log initialization
    console.log('AccessiBridge initialized');
    console.log('Speech Recognition:', speechRecognition.isSupported() ? 'Available' : 'Not supported');
    console.log('Text-to-Speech: Available');
});
