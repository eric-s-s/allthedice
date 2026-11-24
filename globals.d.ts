// globals that come from outside the app's own scripts

// plotly.js, loaded from the CDN in index.html. only the parts the app uses are declared.
declare const Plotly: {
    react(div: HTMLElement, traces: object[], layout: object, config: object): void;
    Plots: {resize(div: Element): void};
};

interface Window {
    allTheDice: {state: AppState};
}
