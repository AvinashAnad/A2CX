# Context: Super Charged TLDR (Word Cloud Extension)

This `context.md` file defines the context and architecture of the "Super Charged TLDR" browser extension built in this repository.

## Overview
The extension provides offline, client-side tools to help users quickly digest long articles or websites. It accomplishes this strictly using pure HTML, CSS, and Vanilla JavaScript without any external parsing servers. 

## Key Features
1. **Extractive Text Summarizer:** 
   - A localized algorithm similar to TextRank.
   - It identifies the top most frequent keywords, scans valid sentences, arrays subsets based on keyword density, and returns the 3 most highly scored sentences chronologically.
   - Designed to run safely and consistently by capping analyzed text limit to ~100k characters.
2. **Reading Time Estimator:**
   - Evaluates the DOM's innerText to estimate the raw word count.
   - Displays estimated reading time using a ~250 words per minute metric.
3. **Interactive Word Cloud:**
   - Visualizes up to 60 of the most frequently used words in a web page, stripping out common stopwords.
   - **Click-to-Highlight:** It utilizes `window.find()` injected via the scripting API so users can click words in the popup to instantly locate them in the document.
4. **Zen Mode (Focus Mode):**
   - Injects a strict overriding CSS stylesheet into the active page blocking `nav`, `aside`, `footer`, iframe tags, and common sidebar elements to reduce digital distractions.
   - Forces a dark-mode theme across the active view and constrains maximum width for easier focal reading.

## Architecture & Work Flow
The architecture relies entirely on the Chrome Extension Manifest V3 framework:
- **`manifest.json`**: Sets up `activeTab` to query the current page safely and `scripting` to execute logic contexts inside the tab.
- **`popup.html`**: Stores the container structure. Divided into active view tabs (`Word Cloud` vs `Summary`) to optimize spatial layout within Chrome's strict popup dimension constraints (max height 600px).
- **`popup.js`**: Contains two types of logic boundaries:
  - **Popup UX Logic**: Handles button toggling, DOM updates within the popup structure, and dispatching execution calls to Chrome's API.
  - **Injected Payload Logic**: Contains specific, dependency-free functions (`analyzePageText()`, `toggleZenModeOnPage()`, `highlightWordOnPage()`) initialized by the scripting engine that run isolated within the website itself. Results are shipped back to the popup space asynchronously.

## Current State
All scripts are heavily optimized to prevent unresponsiveness by swapping out intensive Regex mapping for native string splitting arrays when querying lengthy terms. The current logic effectively balances speed vs thorough semantic processing entirely in a client-side environment.
