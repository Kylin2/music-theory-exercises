document.addEventListener('DOMContentLoaded', () => {
    // Only run if we are on the exercise page
    const exerciseArea = document.querySelector('.exercise-area');
    if (!exerciseArea) return;

    const chapterId = exerciseArea.dataset.chapterId;
    loadQuestion(chapterId);
});

async function loadQuestion(chapterId) {
    const exerciseArea = document.querySelector('.exercise-area');
    exerciseArea.innerHTML = '<div class="loader" style="display:block; margin: 0 auto;"></div>';

    try {
        const response = await fetch(`/api/question/${chapterId}`);
        const question = await response.json();

        renderQuestion(question, chapterId);
    } catch (error) {
        console.error('Error loading question:', error);
        exerciseArea.innerHTML = '<p class="text-danger">Failed to load question. <button onclick="location.reload()" class="option-btn">Retry</button></p>';
    }
}

function renderQuestion(question, chapterId) {
    const exerciseArea = document.querySelector('.exercise-area');
    exerciseArea.innerHTML = ''; // Clear loader

    // Container for question
    const container = document.createElement('div');
    container.className = 'question-container';

    // Question Text
    const title = document.createElement('h2');
    title.className = 'question-text';
    title.innerHTML = question.question_text.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
    container.appendChild(title);

    // Render based on type
    if (question.type === 'multiple_choice') {
        renderMultipleChoice(container, question, chapterId);
    } else if (question.type === 'piano_click') {
        renderPianoQuestion(container, question, chapterId);
    } else if (question.type === 'piano_sequence') {
        renderPianoSequence(container, question, chapterId);
    } else if (question.type === 'text_input') {
        renderTextInput(container, question, chapterId);
    } else if (question.type === 'metronome_tool') {
        renderMetronomeTool(container, question, chapterId);
    } else if (question.type === 'rhythm_tool') {
        renderRhythmTool(container, question, chapterId);
    }

    // Feedback Overlay
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    // Use innerHTML properly later
    container.appendChild(overlay);

    exerciseArea.appendChild(container);
}

// Global state for sequence
let currentSequenceState = {
    target: [],
    currentIdx: 0
};

// --- Rhythm Logic ---
class RhythmTool {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.pattern = [];
        this.bpm = 90; // Default
        this.bars = 2; // Default
        this.beatsPerBar = 4; // Default
        this.useMetronome = false;
    }

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    generatePattern() {
        const totalBeats = this.bars * this.beatsPerBar;
        this.pattern = [];

        for (let i = 0; i < totalBeats; i++) {
            if (i === 0) {
                this.pattern.push('X'); // Always start with a note for clarity
            } else {
                const prev = this.pattern[this.pattern.length - 1];
                let choices = ['X', '0'];
                if (prev === 'X' || prev === '-') choices.push('-');

                // Weighting to make it musical
                // Reduce chance of 0 after 0
                if (prev === '0') choices = ['X', 'X', '0'];

                this.pattern.push(choices[Math.floor(Math.random() * choices.length)]);
            }
        }
        return this.pattern.join(' ');
    }

    play(onComplete) {
        if (this.isPlaying) return;
        this.init();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        this.isPlaying = true;
        const beatDuration = 60.0 / this.bpm;
        const startTime = this.audioContext.currentTime + 0.1;

        // Schedule beats
        for (let i = 0; i < this.pattern.length; i++) {
            const time = startTime + (i * beatDuration);
            const type = this.pattern[i];

            // Metronome Click?
            if (this.useMetronome) {
                this.playClick(time, i % this.beatsPerBar === 0);
            }

            // Rhythm Note
            if (type === 'X') {
                // Calculate duration based on following '-'
                let dur = beatDuration;
                let j = i + 1;
                while (j < this.pattern.length && this.pattern[j] === '-') {
                    dur += beatDuration;
                    j++;
                }
                this.playDaVoice(time, dur * 0.95);
            }
        }

        setTimeout(() => {
            this.isPlaying = false;
            if (onComplete) onComplete();
        }, (this.pattern.length * beatDuration * 1000) + 500);
    }

    playClick(time, isStrong) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.frequency.value = isStrong ? 1200 : 800;
        osc.type = 'square';

        gain.gain.setValueAtTime(isStrong ? 0.3 : 0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        osc.start(time);
        osc.stop(time + 0.05);
    }

    playDaVoice(time, duration) {
        // Synthesize "Da" sound using filtered sawtooth/triangle
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        osc.frequency.value = 261.6; // C4
        osc.type = 'sawtooth';

        filter.type = 'lowpass';
        filter.Q.value = 5;

        // Connect
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);

        // Filter Envelope (Vowel-like formant movement)
        // Closed -> Open -> Closed
        filter.frequency.setValueAtTime(200, time);
        filter.frequency.linearRampToValueAtTime(800, time + 0.1);
        filter.frequency.linearRampToValueAtTime(400, time + 0.2);

        // Amp Envelope
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.8, time + 0.05); // Attack
        gain.gain.exponentialRampToValueAtTime(0.3, time + 0.2); // Decay
        gain.gain.linearRampToValueAtTime(0, time + duration); // Release

        osc.start(time);
        osc.stop(time + duration);
    }
}

let rhythmTool = new RhythmTool();

function renderRhythmTool(container, question, chapterId) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '25px';
    wrapper.style.width = '100%';

    // --- Settings Panel ---
    const settingsPanel = document.createElement('div');
    settingsPanel.style.display = 'flex';
    settingsPanel.style.gap = '20px';
    settingsPanel.style.flexWrap = 'wrap';
    settingsPanel.style.justifyContent = 'center';
    settingsPanel.style.background = 'rgba(0,0,0,0.2)';
    settingsPanel.style.padding = '15px';
    settingsPanel.style.borderRadius = '15px';

    // BPM
    const bpmWrap = createSettingInput('BPM', '90', (v) => rhythmTool.bpm = parseInt(v));
    // Bars
    const barsWrap = createSettingInput('Bars', '2', (v) => rhythmTool.bars = parseInt(v));
    // Time Sig
    const tsWrap = document.createElement('div');
    tsWrap.className = 'setting-item';
    tsWrap.innerHTML = '<label>Time Sig</label>';
    const tsSelect = document.createElement('select');
    tsSelect.innerHTML = '<option value="4">4/4</option><option value="3">3/4</option>';
    tsSelect.style.padding = '5px';
    tsSelect.style.background = '#334155';
    tsSelect.style.color = '#fff';
    tsSelect.style.border = 'none';
    tsSelect.style.borderRadius = '5px';
    tsSelect.onchange = (e) => rhythmTool.beatsPerBar = parseInt(e.target.value);
    tsWrap.appendChild(tsSelect);

    settingsPanel.append(bpmWrap, barsWrap, tsWrap);

    // --- Controls ---
    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '15px';

    // Generate Btn
    const generateBtn = document.createElement('button');
    generateBtn.textContent = '🎲 Generate';
    generateBtn.className = 'option-btn';

    // Play Btn
    const playBtn = document.createElement('button');
    playBtn.textContent = '▶ Play';
    playBtn.className = 'play-btn';
    playBtn.style.fontSize = '1.2rem';
    playBtn.style.padding = '12px 30px';
    playBtn.style.marginTop = '0';
    playBtn.disabled = true;

    // Metronome Toggle
    const metroToggle = document.createElement('label');
    metroToggle.style.display = 'flex';
    metroToggle.style.alignItems = 'center';
    metroToggle.style.gap = '10px';
    metroToggle.style.cursor = 'pointer';
    metroToggle.innerHTML = '<input type="checkbox" id="metro-check"> <span>Metronome</span>';
    metroToggle.querySelector('input').onchange = (e) => rhythmTool.useMetronome = e.target.checked;

    controlsRow.append(generateBtn, playBtn);

    // --- Interaction Area ---
    const input = document.createElement('input');
    input.className = 'theory-input';
    input.placeholder = 'Generate first...';
    input.style.letterSpacing = '3px';

    const feedbackText = document.createElement('div');
    feedbackText.style.height = '20px';
    feedbackText.style.color = 'var(--text-secondary)';

    const showInfo = document.createElement('div');
    showInfo.className = 'answer-box';
    showInfo.style.display = 'none';
    showInfo.style.marginTop = '10px';
    showInfo.style.padding = '10px';
    showInfo.style.background = 'rgba(16, 185, 129, 0.1)';
    showInfo.style.color = '#10b981';
    showInfo.style.borderRadius = '8px';

    // --- Logic Wiring ---
    let currentAnswer = "";

    generateBtn.onclick = () => {
        currentAnswer = rhythmTool.generatePattern();
        playBtn.disabled = false;
        input.value = '';
        input.placeholder = 'Type rhythm (X 0 -)...';
        input.focus();
        showInfo.style.display = 'none';
        feedbackText.textContent = "New rhythm generated!";
        setTimeout(() => feedbackText.textContent = "", 2000);

        // Auto play? Maybe not, allow user to press play
    };

    playBtn.onclick = () => {
        if (rhythmTool.isPlaying) return;
        playBtn.classList.add('active');
        rhythmTool.play(() => playBtn.classList.remove('active'));
    };

    // Check Logic
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Check';
    submitBtn.className = 'option-btn';

    const check = () => {
        if (!currentAnswer) return;
        let val = input.value.trim().toUpperCase().replace(/\s+/g, ' ');
        if (val === currentAnswer) {
            feedbackText.textContent = "Correct!";
            feedbackText.style.color = '#10b981';
            input.style.borderColor = '#10b981';
        } else {
            feedbackText.textContent = "Try again.";
            feedbackText.style.color = '#ef4444';
            input.style.borderColor = '#ef4444';
        }
    };

    submitBtn.onclick = check;
    input.onkeypress = (e) => { if (e.key === 'Enter') check(); };

    const showAnsBtn = document.createElement('button');
    showAnsBtn.textContent = '👁 Show Answer';
    showAnsBtn.className = 'ts-btn'; // Small style
    showAnsBtn.onclick = () => {
        if (!currentAnswer) return;
        showInfo.textContent = currentAnswer;
        showInfo.style.display = 'block';
    };

    // Assemble
    wrapper.append(settingsPanel, metroToggle, controlsRow, input, submitBtn, feedbackText, showAnsBtn, showInfo);
    container.appendChild(wrapper);
}

function createSettingInput(label, def, onChange) {
    const div = document.createElement('div');
    div.className = 'setting-item';
    div.innerHTML = `<label>${label}</label>`;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = def;
    inp.style.width = '60px';
    inp.style.padding = '5px';
    inp.style.borderRadius = '5px';
    inp.style.border = 'none';
    inp.style.background = '#334155';
    inp.style.color = '#fff';
    inp.onchange = (e) => onChange(e.target.value);
    div.appendChild(inp);
    return div;
}

// --- Metronome Logic ---
class MetronomeEngine {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.tempo = 120;
        this.currentBeatInBar = 0;
        this.beatsPerBar = 4;
        this.lookahead = 25.0; // ms
        this.scheduleAheadTime = 0.1; // s
        this.nextNoteTime = 0.0;
        this.timerID = null;

        // 0: weak, 1: strong, 2: mute
        this.beatPattern = [1, 0, 0, 0];

        this.notesInQueue = [];
    }

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += secondsPerBeat;
        this.currentBeatInBar++;
        if (this.currentBeatInBar >= this.beatsPerBar) {
            this.currentBeatInBar = 0;
        }
    }

    scheduleNote(beatNumber, time) {
        this.notesInQueue.push({ note: beatNumber, time: time });

        // Visual sync callback
        // We use a safe approach via drawing function or checking time in loop, 
        // but for simplicity in this structure we'll trigger events or let the UI loop poll queue.

        // Audio
        let strength = this.beatPattern[beatNumber % this.beatPattern.length];
        if (strength === 2) return; // Mute

        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        if (strength === 1) {
            // Strong beat (High pitch)
            osc.frequency.value = 1000;
            gain.gain.value = 1;
        } else {
            // Weak beat (Low pitch)
            osc.frequency.value = 800;
            gain.gain.value = 0.6;
        }

        osc.start(time);
        osc.stop(time + 0.05);
    }

    scheduler() {
        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentBeatInBar, this.nextNoteTime);
            this.nextNote();
        }
        this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
    }

    start() {
        if (this.isPlaying) return;
        this.init();
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.currentBeatInBar = 0;
        this.nextNoteTime = this.audioContext.currentTime + 0.05;
        this.isPlaying = true;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        clearTimeout(this.timerID);
    }

    setTempo(bpm) {
        this.tempo = bpm;
    }

    setBeats(n) {
        this.beatsPerBar = n;
        // Adjust pattern length
        if (this.beatPattern.length < n) {
            while (this.beatPattern.length < n) this.beatPattern.push(0);
        } else {
            this.beatPattern = this.beatPattern.slice(0, n);
        }
    }

    toggleAccent(idx) {
        // Cycle: 0(Weak) -> 1(Strong) -> 2(Mute) -> 0
        this.beatPattern[idx] = (this.beatPattern[idx] + 1) % 3;
        return this.beatPattern[idx];
    }
}

// Global Metronome Instance
let metronome = new MetronomeEngine();

function renderMetronomeTool(container, question, chapterId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'metronome-wrapper';

    // BPM Display & Control
    const bpmContainer = document.createElement('div');
    bpmContainer.className = 'bpm-container';

    const bpmDisplay = document.createElement('div');
    bpmDisplay.textContent = metronome.tempo;
    bpmDisplay.className = 'bpm-display';

    const bpmLabel = document.createElement('div');
    bpmLabel.textContent = 'BPM';
    bpmLabel.style.color = 'var(--text-secondary)';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '30';
    slider.max = '300';
    slider.value = metronome.tempo;
    slider.className = 'bpm-slider';
    slider.oninput = (e) => {
        const val = parseInt(e.target.value);
        metronome.setTempo(val);
        bpmDisplay.textContent = val;
    };

    bpmContainer.append(bpmDisplay, bpmLabel, slider);

    // Visual Beats
    const beatsContainer = document.createElement('div');
    beatsContainer.className = 'beats-container';

    function renderBeats() {
        beatsContainer.innerHTML = '';
        metronome.beatPattern.forEach((strength, idx) => {
            const beat = document.createElement('div');
            beat.className = `beat-indicator strength-${strength}`;
            beat.id = `beat-${idx}`;

            // Interaction: click to toggle accent
            beat.onclick = () => {
                metronome.toggleAccent(idx);
                renderBeats(); // Re-render to show new state
            };

            beatsContainer.appendChild(beat);
        });
    }
    renderBeats();

    // Time Sig Controls
    const tsContainer = document.createElement('div');
    tsContainer.className = 'ts-container';
    [2, 3, 4, 6].forEach(num => {
        const btn = document.createElement('button');
        btn.textContent = `${num}/4`;
        if (num === 6) btn.textContent = '6/8';
        btn.className = 'ts-btn';
        if (metronome.beatsPerBar === num) btn.classList.add('active');

        btn.onclick = () => {
            document.querySelectorAll('.ts-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            metronome.setBeats(num);
            renderBeats();
        };

        tsContainer.appendChild(btn);
    });

    // Play/Stop
    const playBtn = document.createElement('button');
    playBtn.textContent = metronome.isPlaying ? 'STOP' : 'START';
    playBtn.className = 'play-btn';
    playBtn.onclick = () => {
        if (metronome.isPlaying) {
            metronome.stop();
            playBtn.textContent = 'START';
            playBtn.classList.remove('active');
        } else {
            metronome.start();
            playBtn.textContent = 'STOP';
            playBtn.classList.add('active');
            requestAnimationFrame(uiLoop);
        }
    };

    wrapper.append(bpmContainer, beatsContainer, tsContainer, playBtn);
    container.appendChild(wrapper);

    // UI Animation Loop for visual beat flash
    function uiLoop() {
        if (!metronome.isPlaying) return;

        const currentTime = metronome.audioContext.currentTime;

        while (metronome.notesInQueue.length && metronome.notesInQueue[0].time < currentTime) {
            const currentNote = metronome.notesInQueue[0];
            metronome.notesInQueue.splice(0, 1);

            // Trigger visual flash
            const beatEl = document.getElementById(`beat-${currentNote.note}`);
            if (beatEl) {
                beatEl.classList.add('flash');
                setTimeout(() => beatEl.classList.remove('flash'), 100);
            }
        }

        requestAnimationFrame(uiLoop);
    }
}

function renderTextInput(container, question, chapterId) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '20px';
    wrapper.style.marginTop = '20px';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'theory-input';
    input.placeholder = 'Type your answer...';
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.className = 'option-btn';
    submitBtn.style.maxWidth = '200px';

    const check = () => {
        const val = input.value.trim();
        // Case insensitive match
        // correct_answer is a list of strings
        if (!val) return;

        const isCorrect = question.correct_answer.some(ans => ans.toLowerCase() === val.toLowerCase());

        if (isCorrect) {
            handleAnswer(submitBtn, true, chapterId);
        } else {
            handleAnswer(submitBtn, false, chapterId);
            // Shake effect or just red
            input.style.borderColor = '#ef4444';
            setTimeout(() => input.style.borderColor = '', 1000);
        }
    };

    submitBtn.onclick = check;
    input.onkeypress = (e) => {
        if (e.key === 'Enter') check();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(submitBtn);
    container.appendChild(wrapper);

    // Auto focus
    setTimeout(() => input.focus(), 100);
}

function renderMultipleChoice(container, question, chapterId) {
    // Placeholder visualization for note
    if (question.extra_data && question.extra_data.note) {
        const visual = document.createElement('div');
        visual.className = 'note-display';
        // Simple text representation for now, images would be better
        visual.textContent = question.extra_data.note + " (" + question.extra_data.clef + ")";
        // In real app, we'd render the stave here
        container.appendChild(visual);
    }

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options-grid';

    question.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt.label;
        btn.onclick = () => handleAnswer(btn, opt.is_correct, chapterId);
        optionsDiv.appendChild(btn);
    });

    container.appendChild(optionsDiv);
}

function renderPianoSequence(container, question, chapterId) {
    // Reset state
    currentSequenceState = {
        target: question.correct_answer, // Array of note names
        currentIdx: 0
    };

    // Visualization of the sequence
    const seqDiv = document.createElement('div');
    seqDiv.className = 'sequence-tracker';
    seqDiv.style.display = 'flex';
    seqDiv.style.gap = '10px';
    seqDiv.style.justifyContent = 'center';
    seqDiv.style.marginBottom = '20px';
    seqDiv.style.flexWrap = 'wrap';

    const labels = question.extra_data.sequence_labels || question.correct_answer;

    labels.forEach((label, idx) => {
        const noteBadge = document.createElement('span');
        noteBadge.textContent = label;
        noteBadge.className = 'seq-note';
        noteBadge.id = `seq-note-${idx}`;
        noteBadge.style.padding = '10px 15px';
        noteBadge.style.borderRadius = '8px';
        noteBadge.style.background = 'rgba(255,255,255,0.1)';
        noteBadge.style.fontSize = '1.5rem';
        noteBadge.style.transition = 'all 0.2s';
        noteBadge.style.minWidth = '50px';
        noteBadge.style.textAlign = 'center';

        if (idx === 0) {
            noteBadge.style.border = '2px solid var(--primary-accent)';
            noteBadge.style.background = 'rgba(56, 189, 248, 0.2)';
        }

        seqDiv.appendChild(noteBadge);
    });

    container.appendChild(seqDiv);

    // Reuse Piana Render
    renderPianoQuestion(container, question, chapterId); // This renders the keys and attaches MIDI
}

function renderPianoQuestion(container, question, chapterId) {
    // Simple 1 octave piano for demo
    // C4 to B4
    const pianoWrapper = document.createElement('div');
    pianoWrapper.className = 'piano-wrapper';

    const keys = [
        { note: 'C', type: 'white', left: 0 },
        { note: 'C#', type: 'black', left: 40 },
        { note: 'D', type: 'white', left: 60 },
        { note: 'D#', type: 'black', left: 100 },
        { note: 'E', type: 'white', left: 120 },
        { note: 'F', type: 'white', left: 180 },
        { note: 'F#', type: 'black', left: 220 },
        { note: 'G', type: 'white', left: 240 },
        { note: 'G#', type: 'black', left: 280 },
        { note: 'A', type: 'white', left: 300 },
        { note: 'A#', type: 'black', left: 340 },
        { note: 'B', type: 'white', left: 360 }
    ];

    // Assuming we just need to match the note name (ignoring octave for MVP simplicity)
    // The question.correct_answer is like "C", "F#"

    // Sort so white keys render first (z-index handle via css, but DOM order helps positioning logic if relative)
    // Actually absolute positioning for blacks is easier.

    // Check wrapper width needed: 7 white keys * 60px = 420px approx
    pianoWrapper.style.width = (7 * 60) + 'px';
    pianoWrapper.style.height = '200px';

    keys.forEach(k => {
        const keyDiv = document.createElement('div');
        keyDiv.className = `piano-key key-${k.type}`;
        keyDiv.dataset.note = k.note;

        if (k.type === 'black') {
            keyDiv.style.left = k.left + 'px';
        } else {
            // White keys are easier in flow if flex, but mixing is hard. 
            // Let's use absolute for all for precise control in this generated view
            keyDiv.style.position = 'absolute';
            keyDiv.style.left = k.left + 'px';
            keyDiv.style.top = '0';
        }

        keyDiv.onclick = (e) => {
            // Highlight
            keyDiv.classList.add('active');
            setTimeout(() => keyDiv.classList.remove('active'), 200);

            checkPianoInput(k.note, keyDiv, question, chapterId);
        };

        pianoWrapper.appendChild(keyDiv);
    });

    container.appendChild(pianoWrapper);

    // Initialize MIDI
    initMIDI(chapterId, question);
}

// Global MIDI connection state
let midiAccess = null;

function logDebug(msg) {
    console.log(msg);
    let debugBox = document.getElementById('midi-debug');
    if (!debugBox) {
        debugBox = document.createElement('div');
        debugBox.id = 'midi-debug';
        debugBox.style.position = 'fixed';
        debugBox.style.bottom = '80px';
        debugBox.style.right = '20px';
        debugBox.style.width = '300px';
        debugBox.style.height = '150px';
        debugBox.style.overflowY = 'scroll';
        debugBox.style.background = 'rgba(0,0,0,0.8)';
        debugBox.style.color = '#fff';
        debugBox.style.fontSize = '12px';
        debugBox.style.padding = '10px';
        debugBox.style.zIndex = '9999';
        document.body.appendChild(debugBox);
    }
    const line = document.createElement('div');
    line.textContent = msg;
    debugBox.prepend(line);
}

function initMIDI(chapterId, currentQuestion) {
    if (midiAccess) {
        refreshMIDIInputs(chapterId, currentQuestion);
        return;
    }

    if (!navigator.requestMIDIAccess) {
        logDebug('Web MIDI API not supported in this browser.');
        return;
    }

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);

    function onMIDISuccess(access) {
        logDebug('MIDI Access Granted');
        midiAccess = access;

        refreshMIDIInputs(chapterId, currentQuestion);

        midiAccess.onstatechange = (e) => {
            logDebug(`State Change: ${e.port.name} (${e.port.type}) -> ${e.port.state}`);
            refreshMIDIInputs(chapterId, currentQuestion);
        };

        // Show indicator
        let indicator = document.getElementById('midi-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'midi-indicator';
            indicator.style.position = 'fixed';
            indicator.style.bottom = '20px';
            indicator.style.right = '20px';
            indicator.style.padding = '10px 20px';
            indicator.style.background = 'rgba(16, 185, 129, 0.2)';
            indicator.style.border = '1px solid #059669';
            indicator.style.borderRadius = '20px';
            indicator.style.color = '#10b981';
            indicator.style.zIndex = '1000';
            indicator.textContent = 'MIDI Ready';
            document.body.appendChild(indicator);
        }
    }

    function onMIDIFailure(msg) {
        logDebug(`MIDI Failed: ${msg}`);
    }
}

function refreshMIDIInputs(chapterId, currentQuestion) {
    if (!midiAccess) return;

    const inputs = Array.from(midiAccess.inputs.values());
    logDebug(`Scanning... Found ${inputs.length} inputs.`);

    for (let input of inputs) {
        // Re-attach listener to ensure it's active
        input.onmidimessage = (message) => getMIDIMessage(message, chapterId, currentQuestion);
        logDebug(`Listening on: ${input.name} (State: ${input.state})`);
    }
}

function getMIDIMessage(message, chapterId, currentQuestion) {
    const command = message.data[0];
    const note = message.data[1];
    const velocity = (message.data.length > 2) ? message.data[2] : 0;

    logDebug(`MIDI [${command}, ${note}, ${velocity}]`);

    // lenient check for Note On (usually 144-159)
    // Note Off is usually 128-143, OR Note On with velocity 0
    if (command >= 144 && command <= 159 && velocity > 0) {
        handleMIDIInput(note, chapterId, currentQuestion);
    }
}

function handleMIDIInput(noteNumber, chapterId, question) {
    // Map MIDI note to standard note name 
    // Middle C (C4) is 60.
    // Our app just wants the note name e.g. "C", "C#"

    // Notes array to map mod 12 result
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = notes[noteNumber % 12];

    const keyElement = document.querySelector(`.piano-key[data-note="${noteName}"]`);
    if (keyElement) {
        // Trigger visual click
        keyElement.classList.add('active');
        setTimeout(() => keyElement.classList.remove('active'), 200);

        // Check answer using the shared function
        checkPianoInput(noteName, keyElement, question, chapterId);
    }
}

function checkPianoInput(noteName, keyElement, question, chapterId) {
    if (question.type === 'piano_click') {
        const isCorrect = (question.correct_answer === noteName);
        logDebug(`Check: Played ${noteName} vs Expected ${question.correct_answer} -> ${isCorrect}`);
        handleAnswer(keyElement, isCorrect, chapterId);
    } else if (question.type === 'piano_sequence') {
        // Sequence Logic
        const targetNote = currentSequenceState.target[currentSequenceState.currentIdx];
        const isCorrect = (noteName === targetNote);
        logDebug(`Seq Check: Played ${noteName} vs Expected ${targetNote} (Idx ${currentSequenceState.currentIdx}) -> ${isCorrect}`);

        if (isCorrect) {
            // Visual feedback for note
            const badge = document.getElementById(`seq-note-${currentSequenceState.currentIdx}`);
            if (badge) {
                badge.style.background = '#10b981'; // Green
                badge.style.borderColor = '#059669';
            }

            currentSequenceState.currentIdx++;

            // Highlight next target
            const nextBadge = document.getElementById(`seq-note-${currentSequenceState.currentIdx}`);
            if (nextBadge) {
                nextBadge.style.border = '2px solid var(--primary-accent)';
                nextBadge.style.background = 'rgba(56, 189, 248, 0.2)';
            }

            // Check if finished
            if (currentSequenceState.currentIdx >= currentSequenceState.target.length) {
                handleAnswer(keyElement, true, chapterId);
            }
        } else {
            // Wrong note in sequence
            const badge = document.getElementById(`seq-note-${currentSequenceState.currentIdx}`);
            if (badge) {
                badge.style.background = '#ef4444';
                setTimeout(() => { badge.style.background = 'rgba(255,255,255,0.1)'; }, 500);
            }
        }
    }
}

function handleAnswer(element, isCorrect, chapterId) {
    const overlay = document.querySelector('.feedback-overlay');

    if (isCorrect) {
        element.style.background = '#10b981';
        element.style.borderColor = '#059669';
        overlay.innerHTML = '<span class="feedback-success">Correct!</span>';
    } else {
        element.style.background = '#ef4444';
        element.style.borderColor = '#b91c1c';
        overlay.innerHTML = '<span class="feedback-error">Try Again</span>';
    }

    overlay.classList.add('show');

    setTimeout(() => {
        overlay.classList.remove('show');
        if (isCorrect) {
            loadQuestion(chapterId); // Load next
        } else {
            // Reset style
            element.style.background = '';
            element.style.borderColor = '';
        }
    }, 1000);
}
