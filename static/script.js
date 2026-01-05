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
