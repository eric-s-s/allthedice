/**
 * @typedef {object} DiceBuilderActions
 * @property {() => void} done
 * @property {() => void} cancel
 */

/**
 * The one modal dice builder. Only update opens and closes it.
 *
 * Every listener in the modal lives in this class, including the part rows' listeners (see makePartView); the rows
 * only draw. Each listener looks up the open session, edits its builder, then calls update(session), which redraws
 * only the modal: nothing else on the page shows the builder, so the plot, stats and roller are left alone.
 */
class DiceBuilderView {
    /**
     * @param {() => DiceBuilderSession | null} getSession
     * @param {DiceBuilderActions} actions
     */
    constructor(getSession, actions) {
        this.element = /** @type {HTMLDialogElement} */ (getElement('diceBuilder'));
        this.body = findElement(this.element, '.builderBody');
        this.unreadableNote = findElement(this.element, '.builderUnreadableNote');
        this.unreadableTextElement = findElement(this.unreadableNote, 'code');
        this.customKind = /** @type {HTMLSelectElement} */ (findNamed(this.element, 'customKind'));
        this.customSides = /** @type {HTMLInputElement} */ (findNamed(this.element, 'customSides'));
        this.customModifierLabel = findElement(this.element, '.builderCustomModifier');
        this.customModifier = /** @type {HTMLInputElement} */ (findNamed(this.element, 'customModifier'));
        this.weights = findElement(this.element, '.builderWeights');
        this.addCustom = /** @type {HTMLButtonElement} */ (findNamed(this.element, 'addCustom'));
        this.partsEmpty = findElement(this.element, '.builderPartsEmpty');
        this.partList = findElement(this.element, '.builderParts');
        this.modifier = /** @type {HTMLInputElement} */ (findNamed(this.element, 'modifier'));
        this.preview = findElement(this.element, '.builderPreview');
        this.done = /** @type {HTMLButtonElement} */ (findNamed(this.element, 'done'));
        /** @type {Map<string, BuilderPartView>} */
        this.partViews = new Map();
        this.getSession = getSession;

        this.element.querySelectorAll('[data-sides]').forEach(element => {
            const button = /** @type {HTMLButtonElement} */ (element);
            button.addEventListener('click', () => {
                const session = this.getOpenSession();
                session.builder.addPreset(Number(button.dataset.sides));
                this.update(session);
            });
        });
        this.customKind.addEventListener('change', () => {
            const session = this.getOpenSession();
            session.builder.draft.kind = /** @type {BuilderDieKind} */ (this.customKind.value);
            this.update(session);
        });
        this.customSides.addEventListener('input', () => {
            const session = this.getOpenSession();
            session.builder.draft.setSides(this.customSides.value);
            this.update(session);
        });
        this.customModifier.addEventListener('input', () => {
            const session = this.getOpenSession();
            session.builder.draft.modifierInput = this.customModifier.value;
            this.update(session);
        });
        this.weights.addEventListener('input', event => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            const session = this.getOpenSession();
            session.builder.draft.weightInputs[Number(input.dataset.index)] = input.value;
            this.update(session);
        });
        this.addCustom.addEventListener('click', () => {
            const session = this.getOpenSession();
            session.builder.addCustomDie();
            this.update(session);
        });
        this.modifier.addEventListener('input', () => {
            const session = this.getOpenSession();
            session.builder.modifierInput = this.modifier.value;
            this.update(session);
        });
        /** @type {[string, number][]} */
        const customModifierSteps = [['customModifierDown', -1], ['customModifierUp', 1]];
        for (const [name, delta] of customModifierSteps) {
            const button = /** @type {HTMLButtonElement} */ (findNamed(this.element, name));
            onPressAndHold(button, () => {
                const session = this.getOpenSession();
                session.builder.draft.stepModifier(delta);
                this.update(session);
            });
        }
        /** @type {[string, number][]} */
        const modifierSteps = [['modifierDown', -1], ['modifierUp', 1]];
        for (const [name, delta] of modifierSteps) {
            const button = /** @type {HTMLButtonElement} */ (findNamed(this.element, name));
            onPressAndHold(button, () => {
                const session = this.getOpenSession();
                session.builder.stepModifier(delta);
                this.update(session);
            });
        }

        findNamed(this.element, 'close').addEventListener('click', actions.cancel);
        findNamed(this.element, 'cancel').addEventListener('click', actions.cancel);
        this.done.addEventListener('click', actions.done);
        // Escape: the dialog stays open until update closes it
        this.element.addEventListener('cancel', event => {
            event.preventDefault();
            actions.cancel();
        });
        // some browsers close the dialog anyway after a second Escape; keep the state in step
        this.element.addEventListener('close', () => {
            if (getSession() !== null) {
                actions.cancel();
            }
        });
    }

    /** @returns {DiceBuilderSession} the open session; throws when the modal is closed */
    getOpenSession() {
        const session = this.getSession();
        if (session === null) {
            throw new Error('The dice builder is not open.');
        }
        return session;
    }

    /**
     * Makes a part's row and attaches its listeners. Like the constructor's listeners, each one looks up the open
     * session, edits it, then updates the modal.
     * @param {BuilderPart} part
     */
    makePartView(part) {
        const view = new BuilderPartView(part);

        /** @type {[HTMLButtonElement, number][]} */
        const countSteps = [[view.countDown, -1], [view.countUp, 1]];
        for (const [button, delta] of countSteps) {
            onPressAndHold(button, () => {
                const session = this.getOpenSession();
                session.builder.stepCount(part.id, delta);
                this.update(session);
            });
        }
        /** @type {[HTMLInputElement, (text: string) => void][]} */
        const boxes = [
            [view.count, text => {
                part.countInput = text;
            }],
            [view.poolSize, text => {
                part.poolSizeInput = text;
            }],
            [view.keep, text => {
                part.keepInput = text;
            }],
            [view.multiplier, text => {
                part.multiplierInput = text;
            }],
        ];
        for (const [input, write] of boxes) {
            input.addEventListener('input', () => {
                const session = this.getOpenSession();
                write(input.value);
                this.update(session);
            });
        }
        view.wrapper.addEventListener('change', () => {
            const session = this.getOpenSession();
            part.wrapper = /** @type {BuilderWrapper} */ (view.wrapper.value);
            this.update(session);
        });
        view.remove.addEventListener('click', () => {
            const session = this.getOpenSession();
            session.builder.removePart(part.id);
            this.update(session);
        });
        return view;
    }

    /** @param {DiceBuilderSession | null} session */
    update(session) {
        if (session === null) {
            if (this.element.open) {
                this.element.close();
            }
            return;
        }
        const {builder, unreadableText} = session;

        this.unreadableNote.hidden = unreadableText === '';
        this.unreadableTextElement.textContent = unreadableText;

        this.updateDraft(builder.draft);

        syncViews(
            builder.parts,
            this.partViews,
            this.partList,
            part => this.makePartView(part),
            (view, part) => view.update(part),
        );
        this.partsEmpty.hidden = builder.parts.length > 0;

        setInputValue(this.modifier, builder.modifierInput);
        setInvalid(this.modifier, builder.getModifier() === null);

        const buildString = builder.toBuildString();
        this.preview.textContent = buildString === null ? 'Fix the highlighted boxes.'
            : buildString === '' ? 'Add a die to start.' : buildString;
        this.preview.classList.toggle('invalid', buildString === null);
        this.preview.classList.toggle('blank', buildString === '');
        this.done.disabled = buildString === null || buildString === '';

        if (!this.element.open) {
            this.body.scrollTop = 0;
            this.element.showModal();
        }
    }

    /** @param {CustomDieDraft} draft */
    updateDraft(draft) {
        if (this.customKind.value !== draft.kind) {
            this.customKind.value = draft.kind;
        }
        setInputValue(this.customSides, draft.sidesInput);
        setInvalid(this.customSides, draft.getSides() === null);
        this.customModifierLabel.hidden = !draft.hasModifier;
        setInputValue(this.customModifier, draft.modifierInput);
        setInvalid(this.customModifier, draft.getModifier() === null);

        this.weights.hidden = !draft.isWeighted;
        const boxes = this.weights.children;
        while (boxes.length < draft.weightInputs.length) {
            this.weights.append(makeWeightBox(boxes.length));
        }
        while (boxes.length > draft.weightInputs.length) {
            boxes[boxes.length - 1].remove();
        }
        // when every weight is 0, every box is marked, since any one of them could fix it
        const hasPositiveWeight = draft.weightInputs.some((_, index) => (draft.getWeight(index) ?? 0) > 0);
        draft.weightInputs.forEach((text, index) => {
            const input = /** @type {HTMLInputElement} */ (findElement(boxes[index], 'input'));
            setInputValue(input, text);
            setInvalid(input, draft.getWeight(index) === null || !hasPositiveWeight);
        });

        this.addCustom.disabled = draft.toDie() === null;
    }
}

/** One part's row. It only draws; DiceBuilderView.makePartView attaches its listeners. */
class BuilderPartView {
    /** @param {BuilderPart} part */
    constructor(part) {
        this.element = cloneTemplate('builderPartTemplate');
        const dieLabel = dieToBuildString(part.die);
        findElement(this.element, '.builderDieLabel').textContent = dieLabel;
        this.countDown = /** @type {HTMLButtonElement} */ (findNamed(this.element, 'countDown'));
        this.count = /** @type {HTMLInputElement} */ (findNamed(this.element, 'count'));
        this.countUp = /** @type {HTMLButtonElement} */ (findNamed(this.element, 'countUp'));
        this.wrapper = /** @type {HTMLSelectElement} */ (findNamed(this.element, 'wrapper'));
        this.poolLabels = [...this.element.querySelectorAll('.builderPool')].map(label => /** @type {HTMLElement} */ (
            label));
        this.poolSize = /** @type {HTMLInputElement} */ (findNamed(this.element, 'poolSize'));
        this.keep = /** @type {HTMLInputElement} */ (findNamed(this.element, 'keep'));
        this.multiplierLabel = findElement(this.element, '.builderStrong');
        this.multiplier = /** @type {HTMLInputElement} */ (findNamed(this.element, 'multiplier'));
        this.remove = /** @type {HTMLButtonElement} */ (findElement(this.element, '.remove'));

        /** @type {[HTMLElement, string][]} */
        const labels = [
            [this.count, `Count of ${dieLabel}`],
            [this.countDown, `Step count of ${dieLabel} down`],
            [this.countUp, `Step count of ${dieLabel} up`],
            [this.wrapper, `Wrapper for ${dieLabel}`],
            [this.poolSize, `Pool size for ${dieLabel}`],
            [this.keep, `Dice kept from the pool of ${dieLabel}`],
            [this.multiplier, `Multiplier for ${dieLabel}`],
            [this.remove, `Remove ${dieLabel}`],
        ];
        for (const [element, label] of labels) {
            element.setAttribute('aria-label', label);
        }
        this.remove.title = `Remove ${dieLabel}`;
    }

    /** @param {BuilderPart} part */
    update(part) {
        setInputValue(this.count, part.countInput);
        setInvalid(this.count, part.getCount() === null);
        if (this.wrapper.value !== part.wrapper) {
            this.wrapper.value = part.wrapper;
        }
        const isPool = part.wrapper === 'best' || part.wrapper === 'worst';
        this.poolLabels.forEach(label => {
            label.hidden = !isPool;
        });
        setInputValue(this.poolSize, part.poolSizeInput);
        setInvalid(this.poolSize, part.getPoolSize() === null);
        setInputValue(this.keep, part.keepInput);
        setInvalid(this.keep, part.getKeep() === null);
        this.multiplierLabel.hidden = part.wrapper !== 'strong';
        setInputValue(this.multiplier, part.multiplierInput);
        setInvalid(this.multiplier, part.getMultiplier() === null);
    }
}

/**
 * @param {number} index the weight of face index + 1
 * @returns {HTMLElement}
 */
function makeWeightBox(index) {
    const face = index + 1;
    const box = makeElement('span', '');
    box.className = 'builderWeight';
    const label = makeElement('span', String(face));
    label.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.index = String(index);
    input.setAttribute('aria-label', `Weight of face ${face}`);
    box.append(label, input);
    return box;
}

/**
 * @param {HTMLElement} input
 * @param {boolean} isInvalid
 */
function setInvalid(input, isInvalid) {
    if (isInvalid) {
        input.setAttribute('aria-invalid', 'true');
    } else {
        input.removeAttribute('aria-invalid');
    }
}

/**
 * @param {ParentNode} parent
 * @param {string} name
 */
function findNamed(parent, name) {
    return findElement(parent, `[name="${name}"]`);
}
