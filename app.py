"""
AccessiBridge - Accessibility Web Application
Helps people who are blind, deaf, or deafblind communicate and interact with the world.
"""

import os
import sqlite3
import base64
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import google.generativeai as genai

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx'}

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
gemini_model = None

def init_gemini():
    """Initialize Gemini API if key is available."""
    global gemini_model
    if GEMINI_API_KEY:
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            gemini_model = genai.GenerativeModel('gemini-2.5-flash')
            return True
        except Exception as e:
            print(f"Gemini init error: {e}")
            return False
    return False

def get_db():
    """Get database connection."""
    db = sqlite3.connect('accessibility.db')
    db.row_factory = sqlite3.Row
    return db

def init_db():
    """Initialize the database with required tables."""
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS image_descriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transcriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            source TEXT DEFAULT 'speech',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preference_key TEXT UNIQUE NOT NULL,
            preference_value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saved_texts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            speaker TEXT NOT NULL,
            message TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    db.commit()
    db.close()

def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Routes
@app.route('/')
def index():
    """Main landing page."""
    return render_template('index.html', gemini_available=bool(gemini_model))

@app.route('/image-describer')
def image_describer():
    """Image description tool for blind users."""
    return render_template('image_describer.html', gemini_available=bool(gemini_model))

@app.route('/speech-to-text')
def speech_to_text():
    """Speech to text transcription for deaf users."""
    return render_template('speech_to_text.html')

@app.route('/text-to-speech')
def text_to_speech():
    """Text to speech for blind users."""
    return render_template('text_to_speech.html')

@app.route('/communication-bridge')
def communication_bridge():
    """Real-time communication bridge between deaf and hearing users."""
    return render_template('communication_bridge.html')

@app.route('/document-reader')
def document_reader():
    """Document reading tool."""
    return render_template('document_reader.html', gemini_available=bool(gemini_model))

@app.route('/saved-content')
def saved_content():
    """View saved descriptions and transcriptions."""
    db = get_db()
    descriptions = db.execute('SELECT * FROM image_descriptions ORDER BY created_at DESC LIMIT 50').fetchall()
    transcriptions = db.execute('SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT 50').fetchall()
    saved_texts = db.execute('SELECT * FROM saved_texts ORDER BY created_at DESC LIMIT 50').fetchall()
    db.close()
    return render_template('saved_content.html',
                         descriptions=descriptions,
                         transcriptions=transcriptions,
                         saved_texts=saved_texts)

# API Endpoints
@app.route('/api/describe-image', methods=['POST'])
def api_describe_image():
    """Describe an uploaded image using Gemini AI."""
    if not gemini_model:
        return jsonify({'error': 'Gemini API not configured. Please set GEMINI_API_KEY environment variable.'}), 400

    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        # Read image data
        image_data = file.read()

        # Get description mode
        mode = request.form.get('mode', 'detailed')

        # Create prompt based on mode
        if mode == 'quick':
            prompt = "Describe this image in one clear, concise sentence. Focus on the main subject."
        elif mode == 'detailed':
            prompt = """Provide a detailed, accessible description of this image for someone who cannot see it. Include:
            1. Main subject and what's happening
            2. Colors, shapes, and visual elements
            3. Text visible in the image (if any)
            4. Spatial relationships (left, right, foreground, background)
            5. Emotional tone or mood
            Be thorough but organized. Use clear, descriptive language."""
        elif mode == 'navigation':
            prompt = """Describe this image as if helping a blind person navigate or understand a physical space or document. Include:
            1. Layout and structure
            2. Any text, signs, or labels
            3. Important objects and their positions
            4. Potential hazards or obstacles (if applicable)
            5. Key information for practical use"""
        else:  # deafblind mode - simpler, more structured
            prompt = """Describe this image in a simple, structured format for someone who is deafblind:
            SUBJECT: [main subject in 5 words or less]
            DESCRIPTION: [clear, simple description in 2-3 sentences]
            TEXT: [any text visible, or "none"]
            KEY DETAILS: [bullet points of important elements]"""

        # Encode image for Gemini
        image_parts = [{
            'mime_type': file.content_type or 'image/jpeg',
            'data': base64.b64encode(image_data).decode('utf-8')
        }]

        # Generate description
        response = gemini_model.generate_content([prompt, image_parts[0]])
        description = response.text

        # Save to database
        filename = secure_filename(file.filename)
        db = get_db()
        db.execute('INSERT INTO image_descriptions (filename, description) VALUES (?, ?)',
                  (filename, description))
        db.commit()
        db.close()

        return jsonify({
            'success': True,
            'description': description,
            'mode': mode
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-transcription', methods=['POST'])
def api_save_transcription():
    """Save a transcription to the database."""
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        db = get_db()
        db.execute('INSERT INTO transcriptions (text, source) VALUES (?, ?)',
                  (data['text'], data.get('source', 'speech')))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-text', methods=['POST'])
def api_save_text():
    """Save text content for later use."""
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({'error': 'No content provided'}), 400

    try:
        db = get_db()
        db.execute('INSERT INTO saved_texts (title, content, category) VALUES (?, ?, ?)',
                  (data.get('title', 'Untitled'), data['content'], data.get('category', 'general')))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extract-document', methods=['POST'])
def api_extract_document():
    """Extract text from uploaded document using Gemini."""
    if 'document' not in request.files:
        return jsonify({'error': 'No document provided'}), 400

    file = request.files['document']
    if file.filename == '':
        return jsonify({'error': 'No document selected'}), 400

    try:
        content = file.read()
        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''

        # Handle text files directly
        if ext == 'txt':
            try:
                text = content.decode('utf-8')
            except:
                text = content.decode('latin-1')
            return jsonify({'success': True, 'text': text, 'method': 'direct'})

        # Use Gemini for image-based documents (PDFs, images with text)
        if gemini_model and ext in ['pdf', 'png', 'jpg', 'jpeg']:
            mime_type = 'application/pdf' if ext == 'pdf' else f'image/{ext}'

            response = gemini_model.generate_content([
                "Extract all text from this document. Preserve the structure and formatting as much as possible. If it's an image, describe any visual elements along with the text.",
                {'mime_type': mime_type, 'data': base64.b64encode(content).decode('utf-8')}
            ])
            return jsonify({'success': True, 'text': response.text, 'method': 'gemini'})

        return jsonify({'error': 'Unsupported file type or Gemini not available'}), 400

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversation', methods=['POST'])
def api_conversation():
    """Save conversation message to history."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    try:
        db = get_db()
        db.execute('''INSERT INTO conversation_history
                     (session_id, speaker, message, message_type) VALUES (?, ?, ?, ?)''',
                  (data.get('session_id', 'default'),
                   data.get('speaker', 'unknown'),
                   data.get('message', ''),
                   data.get('message_type', 'text')))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/simplify-text', methods=['POST'])
def api_simplify_text():
    """Simplify text for easier understanding (useful for deafblind users)."""
    if not gemini_model:
        return jsonify({'error': 'Gemini API not available'}), 400

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        prompt = f"""Simplify the following text for someone who is deafblind. Use:
        - Short, clear sentences
        - Simple vocabulary
        - Structured format with clear sections
        - No idioms or complex metaphors

        Text to simplify:
        {data['text']}"""

        response = gemini_model.generate_content(prompt)
        return jsonify({'success': True, 'simplified': response.text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/preferences', methods=['GET', 'POST'])
def api_preferences():
    """Get or set user preferences."""
    db = get_db()

    if request.method == 'GET':
        prefs = db.execute('SELECT preference_key, preference_value FROM user_preferences').fetchall()
        db.close()
        return jsonify({row['preference_key']: row['preference_value'] for row in prefs})

    else:  # POST
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        for key, value in data.items():
            db.execute('''INSERT OR REPLACE INTO user_preferences
                         (preference_key, preference_value, updated_at)
                         VALUES (?, ?, CURRENT_TIMESTAMP)''',
                      (key, str(value)))
        db.commit()
        db.close()
        return jsonify({'success': True})

@app.route('/api/delete/<table>/<int:id>', methods=['DELETE'])
def api_delete_item(table, id):
    """Delete an item from specified table."""
    allowed_tables = ['image_descriptions', 'transcriptions', 'saved_texts']
    if table not in allowed_tables:
        return jsonify({'error': 'Invalid table'}), 400

    try:
        db = get_db()
        db.execute(f'DELETE FROM {table} WHERE id = ?', (id,))
        db.commit()
        db.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    # Initialize database
    init_db()

    # Initialize Gemini
    if init_gemini():
        print("✓ Gemini API initialized successfully")
    else:
        print("⚠ Gemini API not configured - some features will be limited")
        print("  Set GEMINI_API_KEY environment variable to enable AI features")

    # Run the app (using port 5001 since 5000 is often used by macOS AirPlay)
    app.run(debug=True, host='0.0.0.0', port=5001)
