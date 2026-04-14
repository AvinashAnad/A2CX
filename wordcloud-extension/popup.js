document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const nvidiaApiKey = await loadNvidiaApiKey();

  // Tab switching logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const contentSections = document.querySelectorAll('.content-section');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      contentSections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Zen Mode toggle logic
  const zenBtn = document.getElementById('zen-btn');
  zenBtn.addEventListener('click', () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: toggleZenModeOnPage,
    });
  });

  // Execute text analysis
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: analyzePageText,
  }, async (results) => {
    if (chrome.runtime.lastError) {
      document.getElementById('loading').textContent = "Cannot analyze this page.";
      console.error(chrome.runtime.lastError);
      return;
    }
    if (results && results[0] && results[0].result) {
      const { wordCounts, metrics, summarySentences, sourceText } = results[0].result;
      
      // Update reading time
      document.getElementById('reading-time').textContent = `Reading: ~${metrics.readingTimeMins} min`;
      
      // Render components
      renderWordCloud(wordCounts, tab.id);
      const loading = document.getElementById('loading');
      loading.style.display = 'block';
      loading.textContent = nvidiaApiKey
        ? 'Generating 5-point AI summary...'
        : 'Using local summary (NVIDIA_API_KEY missing in .env).';

      const finalSummary = await summarizeWithNvidia(sourceText, nvidiaApiKey, summarySentences);
      renderSummary(finalSummary);
      loading.style.display = 'none';
    }
  });
});

async function loadNvidiaApiKey() {
  try {
    const response = await fetch(chrome.runtime.getURL('.env'));
    if (!response.ok) return null;

    const envText = await response.text();
    const lines = envText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
      if (key === 'NVIDIA_API_KEY' && value) {
        return value;
      }
    }

    return null;
  } catch (error) {
    console.warn('Could not load .env API key:', error);
    return null;
  }
}

async function summarizeWithNvidia(sourceText, apiKey, fallbackSummary) {
  if (!apiKey) return fallbackSummary;

  const prompt = [
    'Summarize the following webpage content into exactly 5 bullet points.',
    'Each bullet should be one concise sentence and start with "- ".',
    'Avoid repetition and focus on key facts, actions, and outcomes.',
    '',
    sourceText.slice(0, 12000)
  ].join('\n');

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('NVIDIA API error:', response.status, errText);
      return fallbackSummary;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return fallbackSummary;
    }

    const bullets = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
      .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);

    return bullets.length ? bullets : fallbackSummary;
  } catch (error) {
    console.error('Failed to call NVIDIA API:', error);
    return fallbackSummary;
  }
}

// --- INJECTED FUNCTIONS ---

function analyzePageText() {
  const text = document.body.innerText;
  
  const stopWords = new Set(["a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"]);
  
  // Fast rough estimate for reading time
  const roughWordsCount = text.split(/\\s+/).length;
  
  // Truncate to limit analysis cost on massive pages (e.g. Terms of Service or Books)
  // 100k characters is enough for a strong summary and word cloud representation.
  const limitedText = text.length > 100000 ? text.slice(0, 100000) : text;
  
  // string.split is MUCH faster than regex .match(/.../g) for large text blobs
  const words = limitedText.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3);
  const counts = {};

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!stopWords.has(word)) {
      counts[word] = (counts[word] || 0) + 1;
    }
  }

  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top60Words = sortedCounts.slice(0, 60);

  // 1. Reading Time Estimator
  const readingTimeMins = Math.max(1, Math.ceil(roughWordsCount / 250));

  // 2. Extractive Text Summarizer
  // Using split is significantly faster than backtracking regexes for sentences
  const sentences = limitedText.split(/[.!?\\n]+/).map(s => s.trim()).filter(s => s.length > 20);
  const topKeywords = new Set(sortedCounts.slice(0, 20).map(w => w[0]));
  
  const scoredSentences = sentences.map((sentence, originalIndex) => {
    const sentenceWords = sentence.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3);
    let score = 0;
    
    for (let i = 0; i < sentenceWords.length; i++) {
        if (topKeywords.has(sentenceWords[i])) score++;
    }
    
    if (sentenceWords.length > 5 && sentenceWords.length < 40) { // filter out overly long run-on sentences
      score = score / sentenceWords.length;
    } else {
      score = 0;
    }
    
    return { text: sentence, score, index: originalIndex };
  });

  scoredSentences.sort((a, b) => b.score - a.score);
  const top5 = scoredSentences.slice(0, 5);
  
  // Re-sort chronologically based on their appearance on the page
  top5.sort((a, b) => a.index - b.index);

  const summarySentences = top5.map(item => item.text + ".");

  return {
    wordCounts: top60Words,
    metrics: { readingTimeMins, totalWords: roughWordsCount },
    summarySentences,
    sourceText: limitedText
  };
}

function toggleZenModeOnPage() {
  if (window.__zenModeActive) {
    document.body.classList.remove('zen-mode-active');
    const style = document.getElementById('zen-mode-style');
    if (style) style.remove();
    window.__zenModeActive = false;
    return;
  }

  window.__zenModeActive = true;
  document.body.classList.add('zen-mode-active');
  
  const css = `
    .zen-mode-active {
      background-color: #1a1a1a !important;
      color: #f0f0f0 !important;
    }
    .zen-mode-active * {
      background-color: transparent !important;
      color: inherit !important;
      border-color: #333 !important;
    }
    .zen-mode-active header,
    .zen-mode-active footer,
    .zen-mode-active nav,
    .zen-mode-active aside,
    .zen-mode-active iframe,
    .zen-mode-active .ad,
    .zen-mode-active .ads,
    .zen-mode-active .sidebar,
    .zen-mode-active .comments {
      display: none !important;
    }
    .zen-mode-active main,
    .zen-mode-active article,
    .zen-mode-active .content {
      max-width: 800px !important;
      margin: 0 auto !important;
      padding: 20px !important;
      font-size: 110% !important;
      line-height: 1.6 !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'zen-mode-style';
  style.textContent = css;
  document.head.appendChild(style);
}

function highlightWordOnPage(word) {
  if (!word) return;
  // A simple highlighting feature using window.find which scrolls and selects
  window.find(word, false, false, true, false, true, false);
}

// --- POPUP UI FUNCTIONS ---

function renderWordCloud(wordCounts, tabId) {
  const container = document.getElementById('wordcloud-container');

  if (!wordCounts || wordCounts.length === 0) {
    container.innerHTML = "<p>No usable words found.</p>";
    return;
  }

  const maxCount = wordCounts[0][1];
  const minCount = wordCounts[wordCounts.length - 1][1];

  for (let i = wordCounts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wordCounts[i], wordCounts[j]] = [wordCounts[j], wordCounts[i]];
  }

  wordCounts.forEach(([word, count]) => {
    const span = document.createElement('span');
    span.textContent = word;
    span.className = 'word';
    span.title = `Occurrences: ${count}. Click to find in page.`;
    
    const sizeRange = 30; 
    let size = 12;
    if (maxCount > minCount) {
        size += ((count - minCount) / (maxCount - minCount)) * sizeRange;
    } else {
        size = 20;
    }
    
    span.style.fontSize = `${size}px`;
    span.style.lineHeight = '1.1';
    const negativeWords = new Set(['crash', 'crisis', 'war', 'death', 'panic', 'destruction', 'tension', 'conflict', 'risk', 'instability', 'uncertainty', 'terrible', 'bad', 'worst', 'fail', 'scandal', 'attack', 'threat', 'devastating']);
    const positiveWords = new Set(['good', 'great', 'success', 'happy', 'peace', 'deal', 'optimism', 'growth', 'win', 'positive', 'solution', 'hope', 'recovery', 'progress', 'ceasefire']);
    
    let hue = Math.floor(Math.random() * 360);
    let saturation = '75%';
    let lightness = size > 24 ? '35%' : '50%';
    
    // Apply sentiment coloring
    if (negativeWords.has(word)) {
      hue = 0; // Red
      saturation = '85%';
      lightness = '45%';
    } else if (positiveWords.has(word)) {
      hue = 130; // Green
      saturation = '70%';
      lightness = '35%';
    }

    span.style.color = `hsl(${hue}, ${saturation}, ${lightness})`;
    span.style.fontWeight = size > 26 || negativeWords.has(word) || positiveWords.has(word) ? 'bold' : 'normal';
    
    span.addEventListener('click', () => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: highlightWordOnPage,
        args: [word]
      });
    });

    container.appendChild(span);
  });
}

function renderSummary(summarySentences) {
  const container = document.getElementById('summary-container');
  
  if (!summarySentences || summarySentences.length === 0) {
    container.innerHTML = "<p>Could not generate a summary.</p>";
    return;
  }

  summarySentences.forEach(sentence => {
    const p = document.createElement('p');
    p.className = 'summary-sentence';
    p.textContent = "• " + sentence;
    container.appendChild(p);
  });
}
