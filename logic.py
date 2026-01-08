import random
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass
class Option:
    label: str
    value: str
    is_correct: bool

@dataclass
class Question:
    id: str
    type: str  # 'multiple_choice', 'piano_click', 'identification'
    question_text: str
    image_url: Optional[str] = None
    options: Optional[List[Option]] = None
    correct_answer: Optional[str] = None  # For piano_click types, could be the key ID
    # For piano questions, we might send 'highlight_keys' or similar data
    extra_data: Optional[Dict[str, Any]] = None

@dataclass
class Chapter:
    id: str
    title: str
    description: str
    knowledge_points: List[str]

class QuestionGenerator:
    def __init__(self):
        self.chapters = {
            "1": Chapter(
                id="1",
                title="Chapter 1: Basic Note Names",
                description="Learn the names of the notes on the Treble and Bass clefs.",
                knowledge_points=["treble_clef_notes", "bass_clef_notes"]
            ),
            "2": Chapter(
                id="2",
                title="Chapter 2: Piano Layout",
                description="Understand the layout of the piano keyboard.",
                knowledge_points=["white_keys", "black_keys"]
            ),
            "3": Chapter(
                 id="3",
                 title="Chapter 3: Melody Sequence",
                 description="Practice playing sequences of notes.",
                 knowledge_points=["simple_sequence"]
            ),
            "4": Chapter(
                id="4",
                title="Chapter 4: Theory Concepts",
                description="Enharmonics, Semitones, and Whole Tones.",
                knowledge_points=["enharmonic", "semitone", "wholetone"]
            ),
            "5": Chapter(
                id="5",
                title="Chapter 5: Pro Metronome",
                description="Professional practice tool with adjustable BPM and accents.",
                knowledge_points=["metronome_tool"]
            )
        }
        
        # Basic data for generation
        self.note_data = [
            {"note": "C", "number": "1", "solfege": "Do"},
            {"note": "D", "number": "2", "solfege": "Re"},
            {"note": "E", "number": "3", "solfege": "Mi"},
            {"note": "F", "number": "4", "solfege": "Fa"},
            {"note": "G", "number": "5", "solfege": "Sol"},
            {"note": "A", "number": "6", "solfege": "La"},
            {"note": "B", "number": "7", "solfege": "Si"},
        ]

        # Chromatic scale for interval calculations (Index 0-11)
        # Using a list of sets/lists to handle enharmonics at each position
        self.chromatic_scale = [
            ["C", "B#"],        # 0
            ["C#", "Db"],       # 1
            ["D"],              # 2
            ["D#", "Eb"],       # 3
            ["E", "Fb"],        # 4
            ["F", "E#"],        # 5
            ["F#", "Gb"],       # 6
            ["G"],              # 7
            ["G#", "Ab"],       # 8
            ["A"],              # 9
            ["A#", "Bb"],       # 10
            ["B", "Cb"]         # 11
        ]
        
    def get_chapters(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": c.id,
                "title": c.title,
                "description": c.description
            }
            for c in self.chapters.values()
        ]

    def generate_question(self, chapter_id: str) -> Dict[str, Any]:
        if chapter_id not in self.chapters:
            return None
            
        chapter = self.chapters[chapter_id]
        
        # New logic for Chapter 1
        if chapter_id == "1":
             q_type = random.choice(["clef", "note_to_solfege", "solfege_to_note", "note_to_number", "number_to_note"])
             if q_type == "clef":
                 return self._generate_note_question("treble") # simplified
             else:
                 return self._generate_connection_question(q_type)
        
        # Logic for Chapter 3
        if chapter_id == "3":
            return self._generate_sequence_question()

        # Logic for Chapter 4
        if chapter_id == "4":
            return self._generate_theory_question()
            
        # Logic for Chapter 5 (Tool)
        if chapter_id == "5":
            return {
                "id": "metronome",
                "type": "metronome_tool",
                "question_text": "Professional Metronome",
                "extra_data": {}
            }

        point = random.choice(chapter.knowledge_points)
        
        if point == "treble_clef_notes":
            return self._generate_note_question("treble")
        elif point == "bass_clef_notes":
            return self._generate_note_question("bass")
        elif point == "white_keys":
            return self._generate_piano_question("white")
        elif point == "black_keys":
            return self._generate_piano_question("black")
            
        return None

    def _generate_theory_question(self) -> Dict[str, Any]:
        q_type = random.choice(["enharmonic", "semitone", "wholetone"])
        
        if q_type == "enharmonic":
            # Pick a note that actually has an enharmonic equivalent in our basic list
            # indices 1, 3, 4, 5, 6, 8, 10, 11 (mostly blacks + B/C E/F boundaries)
            # Let's simple pick from indices with > 1 element
            candidates = [i for i, notes in enumerate(self.chromatic_scale) if len(notes) > 1]
            idx = random.choice(candidates)
            notes_at_idx = self.chromatic_scale[idx]
            
            source_note = random.choice(notes_at_idx)
            # The answer is the other one(s). 
            # Simplified: just picking one other as the target answer, or list of valid answers
            valid_answers = [n for n in notes_at_idx if n != source_note]
            
            return {
                "id": str(random.randint(10000, 99999)),
                "type": "text_input",
                "question_text": f"What is the <b>enharmonic equivalent</b> (等音) of <span class='highlight'>{source_note}</span>?",
                "correct_answer": valid_answers, # List of valid strings
                "extra_data": {}
            }
            
        elif q_type == "semitone":
            # Pick any note
            start_idx = random.randint(0, 11)
            direction = random.choice([1, -1]) # Up or Down
            target_idx = (start_idx + direction) % 12
            
            start_note = random.choice(self.chromatic_scale[start_idx])
            valid_answers = self.chromatic_scale[target_idx]
            
            dir_str = "up" if direction == 1 else "down"
            dir_cn = "上" if direction == 1 else "下"
            
            return {
                "id": str(random.randint(10000, 99999)),
                "type": "text_input",
                "question_text": f"What is a <b>semitone {dir_str}</b> (半音{dir_cn}行) from <span class='highlight'>{start_note}</span>?",
                "correct_answer": valid_answers,
                "extra_data": {}
            }

        elif q_type == "wholetone":
             # Pick any note
            start_idx = random.randint(0, 11)
            direction = random.choice([2, -2]) # 2 semitones = whole tone
            target_idx = (start_idx + direction) % 12
            
            start_note = random.choice(self.chromatic_scale[start_idx])
            valid_answers = self.chromatic_scale[target_idx]
            
            dir_str = "up" if direction > 0 else "down"
            dir_cn = "上" if direction > 0 else "下"
            
            return {
                "id": str(random.randint(10000, 99999)),
                "type": "text_input",
                "question_text": f"What is a <b>whole tone {dir_str}</b> (全音{dir_cn}行) from <span class='highlight'>{start_note}</span>?",
                "correct_answer": valid_answers,
                "extra_data": {}
            }
            
        return None

    def _generate_sequence_question(self) -> Dict[str, Any]:
        # Generate a sequence of random notes
        # Length random from 3 to 10
        length = random.randint(3, 10)
        
        # Use note_data to resolve mixed representations (Note, Number, Solfege)
        # Limiting to Naturals (C Major) for this mixed mode to ensure clear mappings
        
        sequence_targets = []
        sequence_labels = []
        
        for _ in range(length):
            item = random.choice(self.note_data)
            target_note = item['note']
            
            # Randomly pick representation
            rtype = random.choice(['note', 'number', 'solfege'])
            label = item[rtype]
            
            sequence_targets.append(target_note)
            sequence_labels.append(label)
        
        return {
            "id": str(random.randint(1000, 9999)),
            "type": "piano_sequence",
            "question_text": "Play the sequence shown below:",
            # We pass the Canonical Notes as the correct_answer for validation
            "correct_answer": sequence_targets, 
            "extra_data": {
                "sequence_labels": sequence_labels # The display text (mixed)
            }
        }

    def _generate_connection_question(self, q_type: str) -> Dict[str, Any]:
        target = random.choice(self.note_data)
        
        question_text = ""
        correct_val = ""
        options_pool = []
        
        if q_type == "note_to_solfege":
            question_text = f"What is the Solfège for note **{target['note']}**?"
            correct_val = target['solfege']
            options_pool = [x['solfege'] for x in self.note_data]
        elif q_type == "solfege_to_note":
            question_text = f"Which note corresponds to Solfège **{target['solfege']}**?"
            correct_val = target['note']
            options_pool = [x['note'] for x in self.note_data]
        elif q_type == "note_to_number":
            question_text = f"What is the Numbered Notation for note **{target['note']}**?"
            correct_val = target['number']
            options_pool = [x['number'] for x in self.note_data]
        elif q_type == "number_to_note":
            question_text = f"Which note corresponds to Number **{target['number']}**?"
            correct_val = target['note']
            options_pool = [x['note'] for x in self.note_data]
            
        # Generate options
        options_pool_copy = options_pool[:]
        options_pool_copy.remove(correct_val)
        wrong_answers = random.sample(options_pool_copy, 3)
        all_options = wrong_answers + [correct_val]
        random.shuffle(all_options)
        
        opts = [
            {"label": opt, "value": opt, "is_correct": (opt == correct_val)}
            for opt in all_options
        ]
        
        return {
            "id": str(random.randint(1000, 9999)),
            "type": "multiple_choice",
            "question_text": question_text,
            "options": opts
        }

    def _generate_note_question(self, clef: str) -> Dict[str, Any]:
        # Logic to generate a note identification question
        # For simplicity in this demo, we assume we have images or draw them with CSS/SVG
        # Here we just generate a structured response
        
        notes = ["C", "D", "E", "F", "G", "A", "B"]
        correct = random.choice(notes)
        
        # Create options
        options_pool = notes[:]
        options_pool.remove(correct)
        wrong_answers = random.sample(options_pool, 3)
        all_options = wrong_answers + [correct]
        random.shuffle(all_options)
        
        opts = [
            {"label": opt, "value": opt, "is_correct": (opt == correct)}
            for opt in all_options
        ]
        
        return {
            "id": str(random.randint(1000, 9999)),
            "type": "multiple_choice",
            "question_text": f"What is this note in {clef.capitalize()} Clef?",
            "image_url": f"/static/images/{clef}_{correct}.png", # Placeholder
            "options": opts,
            "extra_data": {"note": correct, "clef": clef}
        }

    def _generate_piano_question(self, key_type: str) -> Dict[str, Any]:
        # Generate a question asking to identify a key on the piano
        target_note = random.choice(["C", "D", "E", "F", "G", "A", "B"])
        if key_type == "black":
            # Simplify for MVP: just sharps
            target_note = random.choice(["C#", "D#", "F#", "G#", "A#"])
            
        return {
            "id": str(random.randint(1000, 9999)),
            "type": "piano_click",
            "question_text": f"Click the key for: {target_note}",
            "correct_answer": target_note,
            "extra_data": {"target_note": target_note}
        }
