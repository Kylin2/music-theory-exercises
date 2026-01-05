from flask import Flask, render_template, jsonify, request
from logic import QuestionGenerator

app = Flask(__name__)
generator = QuestionGenerator()

@app.route('/')
def home():
    chapters = generator.get_chapters()
    return render_template('index.html', chapters=chapters)

@app.route('/exercise/<chapter_id>')
def exercise(chapter_id):
    # Pass chapter info to template
    chapters = generator.get_chapters()
    current_chapter = next((c for c in chapters if c['id'] == chapter_id), None)
    if not current_chapter:
        return "Chapter not found", 404
    return render_template('exercise.html', chapter=current_chapter)

@app.route('/api/question/<chapter_id>')
def get_question(chapter_id):
    question = generator.generate_question(chapter_id)
    if not question:
        return jsonify({"error": "Invalid chapter"}), 400
    return jsonify(question)

if __name__ == '__main__':
    app.run(debug=True)
