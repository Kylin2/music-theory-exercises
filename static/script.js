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
const RHYTHM_PATTERNS = {
    // Binary Grid (Base 4 subdivisions per beat)
    binary: {
        basic: [
            { name: "Quarter", pattern: "X---" }, // 1 beat
            { name: "Rest", pattern: "0000" }     // 1 beat
        ],
        long: [
            { name: "Whole", pattern: "X---------------" }, // 4 beats
            { name: "Half", pattern: "X-------" }, // 2 beats
            { name: "Half Rest", pattern: "00000000" }
        ],
        eighth: [
            { name: "Eighths", pattern: "X-X-" }, // 2 notes
            { name: "Eighth Rest", pattern: "0-0-" }, // 
            { name: "Run", pattern: "X-0-" }
        ],
        sixteenth: [
            { name: "16ths", pattern: "XXXX" },
            { name: "Gallop", pattern: "X-XX" }, // 8th + 2 16ths
            { name: "RevGallop", pattern: "XXX-" }, // 2 16ths + 8th
            { name: "Eighth 2-16", pattern: "X-XX" },
            { name: "16-Eighth-16", pattern: "XX-X" } // Syncopation check? No this is just 16 variations
        ],
        dotted: [
            { name: "Dotted Quarter", pattern: "X-----X-" }, // 2 beats usually paired with 8th? or 1.5 beat
            { name: "Dot8-16", pattern: "X--X" }, // Dotted 8th + 16th (3+1)
            { name: "16-Dot8", pattern: "XX--" }  // 16th + Dotted 8th (1+3)
        ],
        syncopation: [
            { name: "XiaoQieFen", pattern: "XX-X" }, // 16th(1) + 8th(2) + 16th(1)
            { name: "Offbeat", pattern: "0-X-" },
            { name: "DaQieFen", pattern: "X-X---X-" } // 8th + Quarter + 8th (2 beats: 2+4+2)
        ]
    },
    // Ternary Grid (Base 3 subdivisions per beat)
    ternary: {
        basic: [
            { name: "Quarter", pattern: "X--" },
            { name: "Rest", pattern: "000" }
        ],
        long: [
            { name: "Dotted Half", pattern: "X--------" } // 3 beats? Or just Half/Whole?
            // In ternary (e.g. 12/8 feel or triplets in 4/4)
            // Let's assume Triplets in 4/4.
            // Half note = 2 beats = 6 ticks.
            // Whole note = 4 beats = 12 ticks.
            , { name: "Half", pattern: "X-----" }
            , { name: "Whole", pattern: "X-----------" }
        ],
        triplet: [
            { name: "Triplets", pattern: "XXX" },
            { name: "Swing", pattern: "X-X" }, // Shuffle feel (Quarter + 8th triplet)
            { name: "Rest Trip", pattern: "0X0" }
        ]
    }
};

class RhythmTool {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.pattern = [];
        this.bpm = 80;
        this.bars = 2;
        this.beatsPerBar = 4;
        this.useMetronome = true;

        // Features State
        this.features = {
            quarter: true,
            long: false, // New feature
            eighth: false,
            sixteenth: false,
            dotted: false,
            syncopation: false,
            triplets: false // Exclusive mode
        };

        this.ticksPerBeat = 4; // 4 for binary, 3 for ternary
    }

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    generatePattern() {
        this.pattern = [];
        const f = this.features;
        const isTernary = f.triplets;
        let baseTicks = isTernary ? 3 : 4;

        // Determine optimal resolution (ticksPerBeat)
        // 1: Quarter only
        // 2: 8th (Binary)
        // 4: 16th/Sync/Dot (Binary)
        // 3: Triplet (Ternary)

        if (isTernary) {
            this.ticksPerBeat = 3;
        } else {
            if (f.sixteenth || f.dotted || f.syncopation) {
                this.ticksPerBeat = 4;
            } else if (f.eighth) {
                this.ticksPerBeat = 2;
            } else {
                this.ticksPerBeat = 1;
            }
        }

        const totalBeats = this.bars * this.beatsPerBar;
        let filledBeats = 0;

        const pool = [];
        const rules = isTernary ? RHYTHM_PATTERNS.ternary : RHYTHM_PATTERNS.binary;

        // Build Pool (Select patterns usually defined in Base Resolution)
        // We only pick patterns compatible with current resolution?
        // Actually, our UI toggles enforce this hierarchy naturally.

        if (f.quarter || (!isTernary && Object.values(f).every(v => !v))) {
            pool.push(...rules.basic.map(p => ({ ...p, weight: 10, beats: 1 })));
        }

        if (f.long && rules.long) {
            // Long notes available in all modes (except maybe 1-beat bars?)
            pool.push(...rules.long.map(p => ({ ...p, weight: 4, beats: p.pattern.length / baseTicks })));
        }

        if (!isTernary) {
            if (f.eighth) pool.push(...rules.eighth.map(p => ({ ...p, weight: 8, beats: 1 })));

            if (f.sixteenth) pool.push(...rules.sixteenth.map(p => ({ ...p, weight: 6, beats: 1 })));
            if (f.dotted) pool.push(...rules.dotted.map(p => ({ ...p, weight: 5, beats: 1 })));
            if (f.syncopation) {
                pool.push(...rules.syncopation.filter(p => p.pattern.length === 4).map(p => ({ ...p, weight: 5, beats: 1 })));
                pool.push(...rules.syncopation.filter(p => p.pattern.length === 8).map(p => ({ ...p, weight: 5, beats: 2 })));
            }
        } else {
            pool.push(...rules.triplet.map(p => ({ ...p, weight: 8, beats: 1 })));
        }

        if (pool.length === 0) pool.push({ pattern: isTernary ? "X--" : "X---", beats: 1 });

        while (filledBeats < totalBeats) {
            const remaining = totalBeats - filledBeats;
            const valid = pool.filter(p => p.beats <= remaining);
            if (valid.length === 0) break;

            const choice = valid[Math.floor(Math.random() * valid.length)];

            // Downsample Pattern if needed
            // Pattern is in `baseTicks` (4 or 3)
            // Target is `this.ticksPerBeat`
            // Scale factor = base / target
            const scale = baseTicks / this.ticksPerBeat;

            // Convert "X---" (Base 4) -> "X" (Target 1) if scale is 4
            // Convert "X-X-" (Base 4) -> "XX" (Target 2) if scale is 2

            let adaptedPattern = "";
            for (let i = 0; i < choice.pattern.length; i += scale) {
                adaptedPattern += choice.pattern[i];
            }

            const chars = adaptedPattern.split('');
            this.pattern.push(...chars);
            filledBeats += choice.beats;
        }

        // Return string with spaces every Beat
        const chunks = [];
        for (let i = 0; i < this.pattern.length; i += this.ticksPerBeat) {
            chunks.push(this.pattern.slice(i, i + this.ticksPerBeat).join(''));
        }
        return chunks.join(' ');
    }

    play(onComplete) {
        if (this.isPlaying) return;
        this.init();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        this.isPlaying = true;
        const tickDuration = (60.0 / this.bpm) / this.ticksPerBeat;
        const startTime = this.audioContext.currentTime + 0.1;

        // Schedule
        this.pattern.forEach((symbol, i) => {
            const time = startTime + (i * tickDuration);

            // Metronome: Click on beat start
            if (this.useMetronome && i % this.ticksPerBeat === 0) {
                // Beat accent
                const beatNum = (i / this.ticksPerBeat) % this.beatsPerBar;
                this.playClick(time, beatNum === 0);
            }

            if (symbol === 'X') {
                // Find duration
                let durTicks = 1;
                let j = i + 1;
                while (j < this.pattern.length && (this.pattern[j] === '-' || this.pattern[j] === '0')) {
                    // Treat 0 as silence, but '-' as sustain. 
                    // Our pattern generator uses 0 for rests.
                    // If pattern is X-0-, X gets 2 ticks. 0 gets 2 ticks silence.
                    if (this.pattern[j] === '-') durTicks++;
                    else break;
                    j++;
                }
                this.playDaVoice(time, durTicks * tickDuration * 0.95);
            }
        });

        setTimeout(() => {
            this.isPlaying = false;
            if (onComplete) onComplete();
        }, (this.pattern.length * tickDuration * 1000) + 500);
    }

    playClick(time, isStrong) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.frequency.value = isStrong ? 1200 : 800;
        osc.type = 'square';

        // Louder Click
        // Strong: 0.8, Weak: 0.4
        const vol = isStrong ? 0.8 : 0.4;

        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    playDaVoice(time, duration) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        osc.frequency.value = 261.6;
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.Q.value = 5;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);

        filter.frequency.setValueAtTime(200, time);
        filter.frequency.linearRampToValueAtTime(800, time + 0.05);
        filter.frequency.linearRampToValueAtTime(400, time + 0.15);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.8, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.5, time + 0.1);
        gain.gain.linearRampToValueAtTime(0, time + duration); // Sustain then kill

        osc.start(time);
        osc.stop(time + duration);
    }
}

let rhythmTool = new RhythmTool();

function renderRhythmTool(container, question, chapterId) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:20px; width:100%;';

    // --- Config Section ---
    const configCard = document.createElement('div');
    configCard.className = 'glass-panel'; // reusing typical class
    configCard.style.cssText = 'padding:15px; width:100%; max-width:500px; display:flex; flex-direction:column; gap:15px;';

    // 1. Basic Settings (Bars, BPM, TS)
    const basicRow = document.createElement('div');
    basicRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;';

    const bpmInput = createSettingInput('BPM', rhythmTool.bpm, (v) => rhythmTool.bpm = parseInt(v));
    const barsInput = createSettingInput('Bars', rhythmTool.bars, (v) => rhythmTool.bars = parseInt(v));
    const tsSelect = document.createElement('select');
    tsSelect.innerHTML = '<option value="4">4/4</option><option value="3">3/4</option>';
    tsSelect.style.cssText = 'padding:5px; background:#334155; color:white; border:none; border-radius:5px;';
    tsSelect.onchange = (e) => rhythmTool.beatsPerBar = parseInt(e.target.value);

    basicRow.append(bpmInput, barsInput, tsSelect);

    // 2. Features Toggles
    const featureTitle = document.createElement('div');
    featureTitle.textContent = "Include Patterns:";
    featureTitle.style.cssText = 'font-size:0.9rem; color:var(--primary-accent); font-weight:bold;';

    const featuresGrid = document.createElement('div');
    featuresGrid.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr; gap:10px;';

    const toggles = [
        { key: 'long', label: 'Long Notes (Half/Whole)' },
        { key: 'eighth', label: '8th Notes (八分)' },
        { key: 'sixteenth', label: '16th Notes (十六分)' },
        { key: 'dotted', label: 'Dotted (附点)' },
        { key: 'syncopation', label: 'Syncopation (切分)' },
        { key: 'triplets', label: 'Triplets (三连音) [Exclusive]' }
    ];

    toggles.forEach(t => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.9rem; cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = rhythmTool.features[t.key];

        cb.onchange = (e) => {
            if (t.key === 'triplets' && e.target.checked) {
                // Disable others
                document.querySelectorAll('.rhythm-feature-cb').forEach(c => {
                    if (c !== cb) c.checked = false;
                });
                // Reset internal state
                Object.keys(rhythmTool.features).forEach(k => rhythmTool.features[k] = false);
            } else if (t.key !== 'triplets' && e.target.checked) {
                // Disable triplet
                const tripCb = document.querySelector('.cb-triplets');
                if (tripCb) {
                    tripCb.checked = false;
                    rhythmTool.features.triplets = false;
                }
            }
            rhythmTool.features[t.key] = e.target.checked;
        };
        if (t.key === 'triplets') cb.classList.add('cb-triplets');
        cb.classList.add('rhythm-feature-cb');

        label.append(cb, document.createTextNode(t.label));
        featuresGrid.appendChild(label);
    });

    configCard.append(basicRow, featureTitle, featuresGrid);

    // --- Actions ---
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; gap:15px; margin-top:10px;';

    const generateBtn = document.createElement('button');
    generateBtn.textContent = '🎲 Generate New';
    generateBtn.className = 'option-btn';

    const playBtn = document.createElement('button');
    playBtn.textContent = '▶ Play';
    playBtn.className = 'play-btn';
    playBtn.disabled = true;

    const metroLabel = document.createElement('label');
    metroLabel.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer;';
    metroLabel.innerHTML = '<input type="checkbox" checked> <span>Click Track</span>';
    metroLabel.querySelector('input').onchange = (e) => rhythmTool.useMetronome = e.target.checked;

    actionsRow.append(generateBtn, playBtn, metroLabel);

    // --- Output & Answer ---
    const input = document.createElement('input');
    input.className = 'theory-input';
    input.placeholder = 'Generate first...';
    input.style.letterSpacing = '2px';

    const answerBox = document.createElement('div');
    answerBox.style.cssText = 'display:none; margin-top:10px; padding:15px; background:rgba(255,255,255,0.05); border-radius:8px; width:100%; text-align:center; font-family:monospace; font-size:1.2rem; letter-spacing:3px; word-break:break-all;';

    const feedback = document.createElement('div');
    feedback.style.height = '20px';

    const showAnsBtn = document.createElement('button');
    showAnsBtn.textContent = 'Show Answer';
    showAnsBtn.className = 'ts-btn';
    showAnsBtn.onclick = () => {
        answerBox.style.display = 'block';
        answerBox.textContent = buildVisualAnswer(rhythmTool.pattern, rhythmTool.ticksPerBeat);
    };

    // Logic
    let currentAnswerString = "";

    generateBtn.onclick = () => {
        const rawString = rhythmTool.generatePattern();
        // Convert raw string (blocks) to normalized answer string
        // The generator returns chunks separated by space: "X--- X-X-"
        // We accept that exact string
        currentAnswerString = rawString;

        playBtn.disabled = false;
        playBtn.click(); // Auto play once

        input.value = '';
        input.placeholder = getPlaceholder(rhythmTool.ticksPerBeat);
        answerBox.style.display = 'none';
        feedback.textContent = "";

        // Hint about resolution
        let resName = "1/4 Beat (16th)";
        if (rhythmTool.ticksPerBeat === 1) resName = "1 Beat (Quarter)";
        if (rhythmTool.ticksPerBeat === 2) resName = "1/2 Beat (Eighth)";
        if (rhythmTool.ticksPerBeat === 3) resName = "1/3 Beat (Triplet)";

        feedback.textContent = `Resolution: ${resName}`;
        feedback.style.color = 'var(--text-secondary)';
    };

    playBtn.onclick = () => {
        if (rhythmTool.isPlaying) return;
        playBtn.classList.add('active');
        rhythmTool.play(() => playBtn.classList.remove('active'));
    };

    const checkBtn = document.createElement('button');
    checkBtn.textContent = 'Check';
    checkBtn.className = 'option-btn';
    checkBtn.onclick = () => {
        // Normalize user input
        let val = input.value.trim().toUpperCase().replace(/\s+/g, ' ');
        if (val === currentAnswerString) {
            feedback.textContent = "Correct!";
            feedback.style.color = '#10b981';
        } else {
            feedback.textContent = "Try again.";
            feedback.style.color = '#ef4444';
        }
    };

    wrapper.append(configCard, actionsRow, input, checkBtn, feedback, showAnsBtn, answerBox);
    container.appendChild(wrapper);
}

function buildVisualAnswer(patternArray, ticks) {
    // Format pattern array into chunks
    const chunks = [];
    for (let i = 0; i < patternArray.length; i += ticks) {
        chunks.push(patternArray.slice(i, i + ticks).join(''));
    }
    return chunks.join(' ');
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

function getPlaceholder(ticks) {
    if (ticks === 1) return "Format: X X (Quarter)";
    if (ticks === 2) return "Format: XX XX (Eighths)";
    if (ticks === 3) return "Format: XXX (Triplets)";
    return "Format: X--- (16ths)";
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
