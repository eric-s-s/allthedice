/**
 * @typedef {object} RequestActions
 * @property {() => void} submit
 * @property {() => void} remove
 */

/** @typedef {RequestActions & {step: (bound: 'low' | 'high', delta: number) => void}} StatsRequestActions */

class DiceTableRequestView {
    /**
     * @param {DiceTableRequest} model
     * @param {RequestActions} actions
     */
    constructor(model, actions) {
        this.element = /** @type {HTMLFormElement} */ (cloneTemplate('diceTableRequestTemplate'));
        this.input = /** @type {HTMLInputElement} */ (this.element.elements.namedItem('buildString'));
        this.submitButton = /** @type {HTMLButtonElement} */ (findElement(this.element, '[type=submit]'));
        this.error = findElement(this.element, '.diceTableRequestError');
        this.swatch = findElement(this.element, '.swatch');

        this.input.addEventListener('input', () => {
            model.buildStringInput = this.input.value;
        });
        this.element.addEventListener('submit', event => {
            event.preventDefault();
            actions.submit();
        });
        findElement(this.element, '.remove').addEventListener('click', actions.remove);
    }

    /** @param {DiceTableRequest} model */
    update(model) {
        setInputValue(this.input, model.buildStringInput);
        this.submitButton.disabled = model.isPending;
        this.element.setAttribute('aria-busy', String(model.isPending));
        if (this.error.textContent !== model.error) {
            this.error.textContent = model.error;
        }
        this.error.hidden = model.error === '';
        this.swatch.classList.toggle('active', model.colorIndex !== null);
        this.swatch.style.background = model.colorIndex === null ? '' : getTraceColor(model.colorIndex);
    }
}

class StatsRequestView {
    /**
     * @param {StatsRequest} model
     * @param {StatsRequestActions} actions
     */
    constructor(model, actions) {
        this.element = /** @type {HTMLFormElement} */ (cloneTemplate('statsRequestTemplate'));
        this.low = /** @type {HTMLInputElement} */ (this.element.elements.namedItem('low'));
        this.high = /** @type {HTMLInputElement} */ (this.element.elements.namedItem('high'));

        /** @type {[string, 'low' | 'high', number][]} */
        const stepButtons = [
            ['lowDown', 'low', -1], ['lowUp', 'low', 1], ['highDown', 'high', -1], ['highUp', 'high', 1],
        ];
        for (const [name, bound, delta] of stepButtons) {
            const button = /** @type {HTMLButtonElement} */ (this.element.elements.namedItem(name));
            onPressAndHold(button, () => actions.step(bound, delta));
        }

        onRollBoundTyping(this.low, () => model.lowInput, text => {
            model.lowInput = text;
        });
        onRollBoundTyping(this.high, () => model.highInput, text => {
            model.highInput = text;
        });
        this.element.addEventListener('submit', event => {
            event.preventDefault();
            actions.submit();
        });
        findElement(this.element, '.remove').addEventListener('click', actions.remove);
    }

    /** @param {StatsRequest} model */
    update(model) {
        setInputValue(this.low, model.lowInput);
        setInputValue(this.high, model.highInput);
    }
}

/**
 * Keeps typing that could still become MIN, MAX or a whole number, and undoes the rest, so the box never holds
 * text like 5a or mx. An undone change puts the cursor back where it was.
 * @param {HTMLInputElement} input
 * @param {() => string} getAccepted the text the box held before the change
 * @param {(text: string) => void} accept
 */
function onRollBoundTyping(input, getAccepted, accept) {
    input.addEventListener('input', () => {
        if (isPartialRollBound(input.value)) {
            accept(input.value);
            return;
        }
        const accepted = getAccepted();
        const cursorAfterChange = input.selectionStart ?? input.value.length;
        const cursor = cursorAfterChange - (input.value.length - accepted.length);
        const clampedCursor = Math.min(Math.max(cursor, 0), accepted.length);
        input.value = accepted;
        input.setSelectionRange(clampedCursor, clampedCursor);
    });
}

/** how long a step button is held before it starts repeating */
const holdDelayMs = 500;
/** how often a held step button repeats */
const holdRepeatMs = 70;

/**
 * Runs the action when the button is pressed, then again and again while a pointer holds it down.
 * A click from a pointer is skipped because pressing already ran the action; a click from the keyboard
 * (detail 0) runs it.
 * @param {HTMLButtonElement} button
 * @param {() => void} action
 */
function onPressAndHold(button, action) {
    /** @type {number | undefined} */
    let timer;
    const stop = () => clearTimeout(timer);
    const repeat = () => {
        action();
        timer = setTimeout(repeat, holdRepeatMs);
    };
    button.addEventListener('pointerdown', event => {
        if (event.button !== 0) {
            return;
        }
        stop();
        action();
        timer = setTimeout(repeat, holdDelayMs);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
        button.addEventListener(type, stop);
    }
    button.addEventListener('click', event => {
        if (event.detail === 0) {
            action();
        }
    });
    button.addEventListener('contextmenu', event => event.preventDefault());
}

/**
 * Writes the value only when it changed, so the cursor of the input being typed in is not reset.
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function setInputValue(input, value) {
    if (input.value !== value) {
        input.value = value;
    }
}

/**
 * Gives each model a view, in model order, and drops the views of models that are gone.
 * Elements already in place are not moved, so a focused input keeps its focus.
 * @template {{id: string}} Model
 * @template {{element: HTMLElement}} View
 * @param {Model[]} models
 * @param {Map<string, View>} views
 * @param {HTMLElement} list
 * @param {(model: Model) => View} makeView
 * @param {(view: View, model: Model) => void} updateView
 */
function syncViews(models, views, list, makeView, updateView) {
    const ids = new Set(models.map(model => model.id));
    for (const [id, view] of views) {
        if (!ids.has(id)) {
            view.element.remove();
            views.delete(id);
        }
    }
    models.forEach((model, index) => {
        let view = views.get(model.id);
        if (view === undefined) {
            view = makeView(model);
            views.set(model.id, view);
        }
        updateView(view, model);
        const elementAtIndex = list.children[index] ?? null;
        if (elementAtIndex !== view.element) {
            list.insertBefore(view.element, elementAtIndex);
        }
    });
}

/**
 * @template View
 * @param {Map<string, View>} views
 * @param {string} id
 */
function getView(views, id) {
    const view = views.get(id);
    if (view === undefined) {
        throw new Error(`No view for ${id}.`);
    }
    return view;
}

/** @param {string} id */
function cloneTemplate(id) {
    const template = /** @type {HTMLTemplateElement} */ (getElement(id));
    const element = template.content.firstElementChild;
    if (element === null) {
        throw new Error(`The #${id} template is empty.`);
    }
    return /** @type {HTMLElement} */ (element.cloneNode(true));
}
