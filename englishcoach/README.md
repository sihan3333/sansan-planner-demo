# EnglishCoach / English Hour — public demo

Static portfolio demo adapted from the app's public UI. All initial material and yesterday's activity are synthetic examples. The original app and its private storage were not copied.

## Run / deploy
Serve this directory through any HTTP static server or deploy its contents in a GitHub Pages subdirectory. All assets and module imports are relative. There are no build dependencies, third-party fonts, analytics, or model credentials. JavaScript modules require HTTP(S); opening index.html through file:// may be blocked by the browser.

## Functional interactions
- Actual 10 + 15 + 20 + 15 minute timers, pause, reset, and phase navigation.
- Yesterday's locally generated choice-cloze review from labeled synthetic records.
- Today's scene practice, answer hints, independent retries, and per-round completion.
- Completed questions leave the practice queue; their source expressions remain in the library.
- Expression search, type filters, starring and editable entries.
- Editable preset OCR correction example and local bilingual-text pairing, both reviewed before adding to learning.
- Notes, practice results and recap persist in the browser.
- Preset coach messages are clearly labeled and rotate by turn; they do not interpret user input.
- Browser-native speech only when a local English voice is available.

## Limitations / privacy
No real OCR, semantic grading, microphone, recording, file upload, model connection or external API. Exact-text answer checking is not model accuracy or pronunciation scoring. connect-src 'none' enforces no network connections from scripts.

Only localStorage key englishcoach-public-demo:v1 is used. Reset removes that key only. Corrupt stored JSON recovers with fresh synthetic examples; denied/full storage falls back to the current page's memory and displays a temporary-save label. Refresh clears the memory fallback.

## Test interfaces
demo-adapter.mjs exports STORAGE_KEY, OCR_RAW, loadDemoState(), saveDemoState(state), resetDemo(), demoStorageStatus(), and async demoApi(path,data,method). Supported paths: state, config, engine, extract, chat; unknown paths throw. Core and review modules retain their pure exported functions.
