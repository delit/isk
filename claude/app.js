// ============ FORMATTERS ============
const fmtSEK = n => new Intl.NumberFormat('sv-SE', {
  style: 'currency', currency: 'SEK', maximumFractionDigits: 0
}).format(Math.round(n));

// Renders amount with extra letter-spacing ONLY on the digits, not on "kr"
// e.g. "<span class='num'>1 000 000</span> kr"
function fmtSEKsplit(n) {
  const rounded = Math.round(n);
  const absNum = Math.abs(rounded);
  const numPart = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(absNum);
  const sign = rounded < 0 ? '−' : '';
  return `<span class="num">${sign}${numPart}</span>&nbsp;kr`;
}

function formatInt(n) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n);
}

// Parse a Swedish-formatted text value into a number
function parseSwedish(str) {
  if (str == null) return 0;
  const cleaned = String(str)
    .replace(/[\s\u00A0\u2009\u202F]/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ============ LIVE INPUT FORMATTING ============
function attachInputFormatting(input) {
  const format = input.dataset.format;

  input.addEventListener('input', (e) => {
    const el = e.target;
    const raw = el.value;
    const selStart = el.selectionStart;
    const digitsBeforeCursor = raw.slice(0, selStart).replace(/[^\d]/g, '').length;

    if (format === 'number') {
      const digits = raw.replace(/[^\d]/g, '');
      if (digits === '') { el.value = ''; return; }
      const n = parseInt(digits, 10);
      const formatted = formatInt(n);
      el.value = formatted;
      let newPos = 0, seen = 0;
      while (newPos < formatted.length && seen < digitsBeforeCursor) {
        if (/\d/.test(formatted[newPos])) seen++;
        newPos++;
      }
      el.setSelectionRange(newPos, newPos);
    } else {
      // decimal
      let cleaned = raw.replace(/[^\d,\.]/g, '').replace(/\./g, ',');
      const first = cleaned.indexOf(',');
      if (first !== -1) {
        cleaned = cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/,/g, '');
      }
      const [intRaw, decRaw] = cleaned.split(',');
      const intDigits = (intRaw || '').replace(/[^\d]/g, '');
      let formatted;
      if (intDigits === '' && decRaw === undefined) {
        formatted = '';
      } else {
        const intPart = intDigits === '' ? '0' : formatInt(parseInt(intDigits, 10));
        formatted = decRaw !== undefined ? intPart + ',' + decRaw : intPart;
      }
      el.value = formatted;
      // cursor
      const targetDigits = raw.slice(0, selStart).replace(/[^\d,]/g, '').replace(/,/g, '').length;
      const hadCommaBefore = raw.slice(0, selStart).includes(',');
      let newPos = 0, seen = 0;
      while (newPos < formatted.length && seen < targetDigits) {
        if (/\d/.test(formatted[newPos])) seen++;
        newPos++;
      }
      if (hadCommaBefore && formatted.includes(',') && newPos <= formatted.indexOf(',')) {
        newPos = formatted.indexOf(',') + 1;
      }
      el.setSelectionRange(newPos, newPos);
    }
  });

  input.addEventListener('change', calculate);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') calculate();
  });
}

// ============ STATE ============
const RATES = [6, 7, 8, 9, 10];
const STOP_YEARS = [0, 1, 2, 3, 5, 7, 8, null];
let currentRate = 7;
let compareRate = null; // null = no comparison; otherwise one of RATES
let chart = null;

// FIRE state
const FIRE_RATES = [3, 3.5, 4, 5, 6];
let fireWithdrawalRate = 4;
let lastResults = null;
let lastInputs = null;

// ============ SIMULATION ============
function simulate(start, monthly, years, rate, taxPct, freeAmt, stopAfterYears, feePct, monthlyIncreasePct) {
  const totalMonths = Math.round(years * 12);
  // Net annual rate after fund fee (fee deducted from gross return)
  const netAnnualRate = rate - (feePct || 0);
  const monthlyReturn = Math.pow(1 + netAnnualRate / 100, 1 / 12) - 1;
  const increaseFactor = 1 + ((monthlyIncreasePct || 0) / 100);
  const results = [{ year: 0, value: start }];
  let balance = start;
  let currentMonthly = monthly;

  for (let m = 1; m <= totalMonths; m++) {
    const stopMonth = (stopAfterYears === null) ? Infinity : stopAfterYears * 12;
    if (m <= stopMonth) balance += currentMonthly;
    balance *= (1 + monthlyReturn);

    if (m % 12 === 0) {
      const taxable = Math.max(0, balance - freeAmt);
      balance -= taxable * (taxPct / 100);
      results.push({ year: m / 12, value: balance });
      // After year-end tax, bump the monthly contribution for the coming year
      currentMonthly = currentMonthly * increaseFactor;
    } else if (m === totalMonths) {
      results.push({ year: m / 12, value: balance });
    }
  }
  return results;
}

function runAll(inputs) {
  const out = {};
  for (const rate of RATES) {
    const scenarios = {};
    for (const stop of STOP_YEARS) {
      const key = stop === null ? 'full' : `stop${stop}`;
      scenarios[key] = simulate(
        inputs.start, inputs.monthly, inputs.years,
        rate, inputs.tax, inputs.freeAmount, stop, inputs.fee, inputs.monthlyIncrease
      );
    }
    out[rate] = scenarios;
  }
  return out;
}

// ============ RENDERING ============
function renderRateTabs() {
  const container = document.getElementById('rateTabs');
  container.innerHTML = '';
  RATES.forEach(rate => {
    const btn = document.createElement('button');
    btn.className = 'rate-tab' + (rate === currentRate ? ' active' : '');
    btn.innerHTML = `<span class="pct">${rate}%</span><span class="lbl">Avkastning</span>`;
    btn.onclick = () => {
      currentRate = rate;
      // If compare was set to the new currentRate, clear it
      if (compareRate === currentRate) compareRate = null;
      renderDetailed();
    };
    container.appendChild(btn);
  });
}

function renderCompareTabs() {
  const container = document.getElementById('compareTabs');
  if (!container) return;
  container.innerHTML = '';

  RATES.forEach(rate => {
    const btn = document.createElement('button');
    const isCurrent = rate === currentRate;
    const isActive = rate === compareRate;
    btn.className = 'compare-tab' + (isActive ? ' active' : '');
    btn.disabled = isCurrent;
    btn.textContent = `${rate}%`;
    btn.title = isCurrent ? 'Denna avkastning är redan vald som primär' : (isActive ? `Klicka igen för att stänga av jämförelsen` : `Jämför ${currentRate}% med ${rate}%`);
    btn.onclick = () => {
      if (isCurrent) return;
      compareRate = (compareRate === rate) ? null : rate;
      renderDetailed();
    };
    container.appendChild(btn);
  });
}

function renderSummaryCards(results, inputs) {
  const container = document.getElementById('summaryGrid');
  const scenarios = results[currentRate];
  const finalFull = scenarios.full.slice(-1)[0].value;
  // Total contributions, accounting for annual increase of monthly contribution.
  // Each year the new monthly amount = monthly * (1+inc)^(year-1).
  // For partial year, only the whole months count at that year's rate.
  const inc = (inputs.monthlyIncrease || 0) / 100;
  const yearsFull = Math.floor(inputs.years);
  const extraMonths = Math.round((inputs.years - yearsFull) * 12);
  let totalContributions = inputs.start;
  for (let y = 0; y < yearsFull; y++) {
    totalContributions += inputs.monthly * Math.pow(1 + inc, y) * 12;
  }
  if (extraMonths > 0) {
    totalContributions += inputs.monthly * Math.pow(1 + inc, yearsFull) * extraMonths;
  }
  const profit = finalFull - totalContributions;
  const yearsLabel = Number.isInteger(inputs.years)
    ? `${inputs.years} år`
    : `${String(inputs.years).replace('.', ',')} år`;

  container.innerHTML = `
    <div class="sum-card">
      <div class="k">Slutvärde efter ${yearsLabel}</div>
      <div class="v gold">${fmtSEKsplit(finalFull)}</div>
    </div>
    <div class="sum-card">
      <div class="k">Totalt sparande</div>
      <div class="v">${fmtSEKsplit(totalContributions)}</div>
    </div>
    <div class="sum-card">
      <div class="k">Vinst</div>
      <div class="v">${fmtSEKsplit(profit)}</div>
    </div>
  `;
}

function renderChart(results) {
  const ctx = document.getElementById('chart').getContext('2d');
  const scenarios = results[currentRate];
  const compareScenarios = compareRate !== null ? results[compareRate] : null;
  const yearsInput = lastInputs ? lastInputs.years : 10;
  const yearsLabel = Number.isInteger(yearsInput)
    ? `${yearsInput} år`
    : `${String(yearsInput).replace('.', ',')} år`;

  const labels = scenarios.full.map(p =>
    p.year === 0 ? 'Start' :
    Number.isInteger(p.year) ? `År ${p.year}` : `År ${String(p.year).replace('.', ',')}`
  );

  // PRIMARY palette — all shades of GOLD / AMBER
  // Ordered so "Hela perioden" (most contributions) is the brightest,
  // "Inget sparande" (least) is the darkest. Easy to read intuitively.
  const primaryPalette = [
    { key: 'stop0', label: 'Inget sparande', color: '#5a4a1a', dash: [4, 4] },
    { key: 'stop1', label: 'Stopp 1 år',     color: '#7a6322', dash: [] },
    { key: 'stop2', label: 'Stopp 2 år',     color: '#96792a', dash: [] },
    { key: 'stop3', label: 'Stopp 3 år',     color: '#b08e33', dash: [] },
    { key: 'stop5', label: 'Stopp 5 år',     color: '#c79f3c', dash: [] },
    { key: 'stop7', label: 'Stopp 7 år',     color: '#d9b24a', dash: [] },
    { key: 'stop8', label: 'Stopp 8 år',     color: '#e8c66a', dash: [] },
    { key: 'full',  label: yearsLabel,        color: '#f8e27a', dash: [] },
  ];

  // COMPARE palette — all shades of CYAN / BLUE, same gradient logic
  const comparePalette = [
    { key: 'stop0', color: '#1a3a4a', dash: [6, 3] },
    { key: 'stop1', color: '#234c66', dash: [6, 3] },
    { key: 'stop2', color: '#2a6180', dash: [6, 3] },
    { key: 'stop3', color: '#2e7a9a', dash: [6, 3] },
    { key: 'stop5', color: '#3498b8', dash: [6, 3] },
    { key: 'stop7', color: '#3fb3d4', dash: [6, 3] },
    { key: 'stop8', color: '#5ccfe8', dash: [6, 3] },
    { key: 'full',  color: '#8ee6f5', dash: [6, 3] },
  ];

  const hasCompare = compareScenarios !== null;

  // When no comparison: show plain labels "Inget sparande", "Stopp 2 år" etc (no percentage)
  // When comparison active: annotate primary with its rate
  const primaryDatasets = primaryPalette.map(cfg => ({
    label: hasCompare ? `${cfg.label} · ${currentRate}%` : cfg.label,
    data: scenarios[cfg.key].map(p => p.value),
    borderColor: cfg.color,
    backgroundColor: cfg.color + '15',
    borderWidth: cfg.key === 'full' ? 2.5 : 1.5,
    borderDash: cfg.dash,
    tension: 0.25,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBackgroundColor: cfg.color,
    pointHoverBorderColor: '#0a0a0a',
    pointHoverBorderWidth: 2,
    _group: 'primary',
  }));

  let compareDatasets = [];
  if (hasCompare) {
    compareDatasets = primaryPalette.map((cfg, i) => {
      const cc = comparePalette[i];
      return {
        label: `${cfg.label} · ${compareRate}%`,
        data: compareScenarios[cfg.key].map(p => p.value),
        borderColor: cc.color,
        backgroundColor: 'transparent',
        borderWidth: cfg.key === 'full' ? 2.2 : 1.4,
        borderDash: cc.dash,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: cc.color,
        pointHoverBorderColor: '#0a0a0a',
        pointHoverBorderWidth: 2,
        _group: 'compare',
        _pairColor: cfg.color,
      };
    });
  }

  const datasets = [...primaryDatasets, ...compareDatasets];

  if (chart) chart.destroy();

  const isTouchDevice = window.matchMedia('(hover: none)').matches;

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // On touch devices: require an explicit click/tap to show tooltip, don't follow finger while scrolling
      interaction: isTouchDevice
        ? { mode: 'index', intersect: false, events: ['click'] }
        : { mode: 'index', intersect: false },
      events: isTouchDevice
        ? ['click']
        : ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
      plugins: {
        legend: {
          position: 'bottom',
          maxHeight: 160,
          labels: {
            color: '#9a9185',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            usePointStyle: true,
            pointStyle: 'line',
            padding: 10,
            boxWidth: 16,
            boxHeight: 2,
            filter: (legendItem, data) => {
              // Show all datasets — both primary and compare
              return true;
            },
            generateLabels: (chart) => {
              const datasets = chart.data.datasets;
              // Group: show primary labels normally, compare with dimmer color
              return datasets.map((ds, i) => ({
                text: ds.label,
                fillStyle: ds.borderColor,
                strokeStyle: ds.borderColor,
                lineWidth: ds._group === 'primary' ? 2 : 1,
                lineDash: ds.borderDash || [],
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
                fontColor: ds._group === 'compare' ? '#5a7a8a' : '#9a9185',
              }));
            }
          }
        },
        tooltip: {
          enabled: false,
          external: (context) => {
            const {chart, tooltip} = context;
            let tip = document.getElementById('chartjs-tooltip');
            if (!tip) {
              tip = document.createElement('div');
              tip.id = 'chartjs-tooltip';
              tip.className = 'chart-tooltip';
              document.body.appendChild(tip);
            }
            if (tooltip.opacity === 0) {
              tip.style.opacity = '0';
              return;
            }

            const items = tooltip.dataPoints || [];
            if (!items.length) { tip.style.opacity = 0; return; }

            const idx = items[0].dataIndex;
            const totalPoints = chart.data.labels.length;
            const isLast = idx === totalPoints - 1;
            const label = items[0].label;

            // Build scenario order from primaryPalette (fixed order for stable rows)
            const scenarioOrder = primaryPalette.map(p => p.label);

            // Group primary & compare values by scenario name
            const groupMap = {};
            chart.data.datasets.forEach((ds, dsIdx) => {
              const sceneName = ds.label.split(' · ')[0];
              if (!groupMap[sceneName]) groupMap[sceneName] = {};
              groupMap[sceneName][ds._group] = {
                value: ds.data[idx],
                color: ds.borderColor,
              };
            });

            // Sort scenarios by HIGHER of primary/compare value, descending.
            // Tiebreaker: more years of savings = higher in the list (reversed scenarioOrder index).
            const sortedNames = scenarioOrder.slice().sort((a, b) => {
              const aMax = Math.max(groupMap[a]?.primary?.value ?? 0, groupMap[a]?.compare?.value ?? 0);
              const bMax = Math.max(groupMap[b]?.primary?.value ?? 0, groupMap[b]?.compare?.value ?? 0);
              if (Math.abs(bMax - aMax) > 1) return bMax - aMax;
              // Equal (or near-equal) value: sort by original order reversed (more years first)
              const aIdx = scenarioOrder.indexOf(a);
              const bIdx = scenarioOrder.indexOf(b);
              return bIdx - aIdx; // higher index = more savings = comes first
            });

            // Title
            let titleHtml = '';
            if (hasCompare) {
              titleHtml = `<div class="ct-title">${label}${isLast ? ' · Slutvärde' : ''} <span class="ct-title-vs">${currentRate}% vs ${compareRate}%</span></div>`;
            } else {
              titleHtml = `<div class="ct-title">${label}${isLast ? ' · Slutvärde' : ''}</div>`;
            }

            // Rows
            let bodyHtml = '<div class="ct-rows">';
            sortedNames.forEach(name => {
              const grp = groupMap[name];
              if (!grp) return;
              const pri = grp.primary;
              const cmp = grp.compare;

              if (hasCompare && pri && cmp) {
                // Which is higher?
                const higher = pri.value >= cmp.value ? 'primary' : 'compare';
                const diffAbs = Math.abs(pri.value - cmp.value);
                const diffFormatted = `+${fmtSEK(diffAbs)}`;

                // Primary row
                bodyHtml += `<div class="ct-row">
                  <span class="ct-swatch" style="background:${pri.color}"></span>
                  <span class="ct-name">${name} · ${currentRate}%</span>
                  <span class="ct-amount">${fmtSEK(pri.value)}</span>
                  <span class="ct-diff">${higher === 'primary' ? diffFormatted : ''}</span>
                </div>`;
                // Compare row
                bodyHtml += `<div class="ct-row">
                  <span class="ct-swatch" style="background:${cmp.color}"></span>
                  <span class="ct-name">${name} · ${compareRate}%</span>
                  <span class="ct-amount">${fmtSEK(cmp.value)}</span>
                  <span class="ct-diff">${higher === 'compare' ? diffFormatted : ''}</span>
                </div>`;
              } else if (pri) {
                bodyHtml += `<div class="ct-row ct-row-solo">
                  <span class="ct-swatch" style="background:${pri.color}"></span>
                  <span class="ct-name">${name}</span>
                  <span class="ct-amount">${fmtSEK(pri.value)}</span>
                </div>`;
              }
            });
            bodyHtml += '</div>';

            const footerHtml = `<div class="ct-footer">Stopp = månadssparandet upphör efter X år.<br>Kapitalet fortsätter att växa.</div>`;

            // Reset position + hide while we calculate
            tip.style.opacity = '0';
            tip.style.left = '-9999px';

            const closeHtml = `<button class="ct-close" onclick="this.closest('#chartjs-tooltip').style.opacity='0'" aria-label="Stäng">✕</button>`;
            tip.innerHTML = closeHtml + titleHtml + bodyHtml + footerHtml;
            // Keep pointer-events none on the tooltip itself — only the close button needs to be clickable
            tip.classList.toggle('has-compare', hasCompare);

            // Position the tooltip — must happen after innerHTML is set so we can measure it
            const rect = chart.canvas.getBoundingClientRect();
            const caretX = tooltip.caretX;
            const caretY = tooltip.caretY;

            // Use rAF to let the browser measure the tooltip after paint
            requestAnimationFrame(() => {
              const tw = tip.offsetWidth;
              const th = tip.offsetHeight;
              const margin = 10;
              const scrollX = window.pageXOffset;
              const scrollY = window.pageYOffset;
              const vw = window.innerWidth;
              const vh = window.innerHeight;

              // Preferred: tooltip to the right of caret
              let left = rect.left + scrollX + caretX + 16;
              // If it goes off screen right, flip to left
              if (left + tw > scrollX + vw - margin) {
                left = rect.left + scrollX + caretX - tw - 16;
              }
              // Final clamp: never off left edge
              left = Math.max(scrollX + margin, left);
              // Final clamp: never off right edge
              left = Math.min(scrollX + vw - tw - margin, left);

              // Vertically center on caret, clamp within viewport
              const rawTop = rect.top + scrollY + caretY - th / 2;
              const top = Math.min(
                Math.max(scrollY + margin, rawTop),
                scrollY + vh - th - margin
              );

              tip.style.left = left + 'px';
              tip.style.top = top + 'px';
              tip.style.opacity = '1';
            });
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(212, 175, 55, 0.05)', drawTicks: false },
          border: { color: 'rgba(212, 175, 55, 0.2)' },
          ticks: {
            color: '#5e574d',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            maxRotation: 0,
            autoSkipPadding: 20,
          }
        },
        y: {
          grid: { color: 'rgba(212, 175, 55, 0.05)', drawTicks: false },
          border: { color: 'rgba(212, 175, 55, 0.2)' },
          ticks: {
            color: '#5e574d',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: (v) => {
              if (v >= 1e6) return String((v / 1e6).toFixed(1)).replace('.', ',') + ' mkr';
              if (v >= 1e3) return (v / 1e3).toFixed(0) + ' tkr';
              return v;
            }
          }
        }
      }
    }
  });
}

function renderTable(results) {
  const scenarios = results[currentRate];
  const rows = scenarios.full.length;
  const yearsInput = lastInputs ? lastInputs.years : 10;
  const yearsLabel = Number.isInteger(yearsInput)
    ? `${yearsInput} år`
    : `${String(yearsInput).replace('.', ',')} år`;
  const columns = [
    { key: 'stop0', label: 'Inget sparande' },
    { key: 'stop1', label: 'Stopp 1 år' },
    { key: 'stop2', label: 'Stopp 2 år' },
    { key: 'stop3', label: 'Stopp 3 år' },
    { key: 'stop5', label: 'Stopp 5 år' },
    { key: 'stop7', label: 'Stopp 7 år' },
    { key: 'stop8', label: 'Stopp 8 år' },
    { key: 'full', label: yearsLabel },
  ];

  // Cell formatter without "kr"
  const fmtCell = n => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n));

  let html = '<thead><tr><th>År</th>';
  columns.forEach(c => { html += `<th>${c.label}</th>`; });
  html += '</tr></thead><tbody>';

  for (let i = 0; i < rows; i++) {
    const isFinal = i === rows - 1;
    const yearLabel = (() => {
      const y = scenarios.full[i].year;
      if (y === 0) return 'Start';
      if (Number.isInteger(y)) return `År ${y}`;
      return `År ${String(y).replace('.', ',')}`;
    })();

    html += `<tr${isFinal ? ' class="final"' : ''}><td>${yearLabel}</td>`;

    const rowValues = columns.map(c => scenarios[c.key][i]?.value ?? 0);
    const maxVal = Math.max(...rowValues);

    columns.forEach(c => {
      const point = scenarios[c.key][i];
      const val = point ? point.value : null;
      const isBest = val === maxVal && !isFinal;
      html += `<td${isBest ? ' class="best"' : ''}>${val === null ? '—' : fmtCell(val)}</td>`;
    });
    html += '</tr>';
  }

  // DIFF ROW — keeps "kr"
  const lastIdx = rows - 1;
  const fullFinal = scenarios.full[lastIdx].value;
  html += `<tr class="diff"><td>vs ${yearsLabel}</td>`;
  columns.forEach(c => {
    const val = scenarios[c.key][lastIdx].value;
    const diff = val - fullFinal;
    if (c.key === 'full') {
      html += '<td class="zero">—</td>';
    } else {
      const sign = diff > 0 ? '+' : '';
      html += `<td>${sign}${fmtSEK(diff)}</td>`;
    }
  });
  html += '</tr>';

  html += '</tbody>';
  document.getElementById('table').innerHTML = html;
}

function renderFire(results) {
  if (!results) return;
  const finalFull = results[currentRate].full.slice(-1)[0].value;
  const years = lastInputs ? lastInputs.years : 10;
  const yearsLabel = Number.isInteger(years)
    ? `${years} år`
    : `${String(years).replace('.', ',')} år`;

  // Main kapital display + label
  document.getElementById('fireKapital').innerHTML = fmtSEKsplit(finalFull);
  const labelEl = document.getElementById('fireKapitalLabel');
  if (labelEl) labelEl.textContent = `Ditt kapital efter ${yearsLabel}:`;

  // Rate buttons
  const ratesContainer = document.getElementById('fireRates');
  ratesContainer.innerHTML = '';
  FIRE_RATES.forEach(rate => {
    const btn = document.createElement('button');
    btn.className = 'fire-rate-btn' + (rate === fireWithdrawalRate ? ' active' : '');
    let name;
    if (rate <= 3.5) name = 'Säkrare';
    else if (rate === 4) name = 'Klassisk';
    else name = 'Risk';
    const rateStr = String(rate).replace('.', ',');
    btn.innerHTML = `<span class="fire-pct">${rateStr}%</span><span class="fire-nm">${name}</span>`;
    btn.onclick = () => {
      fireWithdrawalRate = rate;
      renderFire(results);
    };
    ratesContainer.appendChild(btn);
  });

  // Per year / per month — with optional ISK tax deduction
  const taxCheckbox = document.getElementById('fireTaxCheckbox');
  const applyTax = taxCheckbox && taxCheckbox.checked;
  const taxRate = lastInputs ? (lastInputs.tax / 100) : 0;
  const freeAmount = lastInputs ? lastInputs.freeAmount : 0;

  let perYear = finalFull * (fireWithdrawalRate / 100);
  let taxAmount = 0;
  if (applyTax) {
    // Annual ISK tax on the capital, proportionally allocated to the withdrawal
    const taxableCapital = Math.max(0, finalFull - freeAmount);
    taxAmount = taxableCapital * taxRate;
    perYear = Math.max(0, perYear - taxAmount);
  }
  const perMonth = perYear / 12;

  document.getElementById('firePerYear').innerHTML = fmtSEKsplit(perYear);
  document.getElementById('firePerMonth').innerHTML = fmtSEKsplit(perMonth);

  // Update sub-labels
  const yearSub = document.getElementById('firePerYearSub');
  const monthSub = document.getElementById('firePerMonthSub');
  if (applyTax) {
    const taxPerMonth = taxAmount / 12;
    yearSub.textContent = `Årligt uttag efter ISK-skatt (−${fmtSEK(taxAmount)}/år)`;
    monthSub.textContent = `Månatligt uttag efter ISK-skatt (−${fmtSEK(taxPerMonth)}/mån)`;
  } else {
    yearSub.textContent = 'Årligt uttag före eventuell skatt';
    monthSub.textContent = 'Månatligt uttag före eventuell skatt';
  }
}

function renderFee(results) {
  if (!results || !lastInputs) return;
  const inputs = lastInputs;

  // Baseline: same simulation but with 0.2% fee as reference point
  const BASELINE_FEE = 0.2;
  const baseline = simulate(
    inputs.start, inputs.monthly, inputs.years,
    currentRate, inputs.tax, inputs.freeAmount, null, BASELINE_FEE, inputs.monthlyIncrease
  ).slice(-1)[0].value;

  // Rate label inline
  const rateLabel = document.getElementById('feeRateLabel');
  if (rateLabel) rateLabel.textContent = `${currentRate} %`;

  // Baseline display
  const baselineEl = document.getElementById('feeBaseline');
  if (baselineEl) baselineEl.innerHTML = fmtSEKsplit(baseline);

  // Fees to compare
  const FEES = [0.1, 0.2, 0.5, 1, 1.5, 2];
  // Simulate each and collect results
  const feeResults = FEES.map(fee => {
    const finalVal = simulate(
      inputs.start, inputs.monthly, inputs.years,
      currentRate, inputs.tax, inputs.freeAmount, null, fee, inputs.monthlyIncrease
    ).slice(-1)[0].value;
    return { fee, finalVal, loss: baseline - finalVal };
  });

  // Highlight the fee that matches the currently selected fee input
  const currentFee = inputs.fee || 0;

  // Find max finalVal for proportional bar scaling
  const maxFinal = Math.max(...feeResults.map(r => r.finalVal));

  // Build bars — length proportional to finalVal / maxFinal
  const container = document.getElementById('feeBars');
  if (!container) return;
  container.innerHTML = '';

  feeResults.forEach(r => {
    const pct = Math.max(6, (r.finalVal / maxFinal) * 100);
    const feeStr = Number.isInteger(r.fee)
      ? `${r.fee},0`
      : String(r.fee).replace('.', ',');
    const isCurrent = Math.abs(r.fee - currentFee) < 0.001;
    const highlightClass = isCurrent ? ' highlight' : '';

    // Loss text: negative = below baseline, positive = above baseline
    let lossText, lossCls;
    if (r.loss > 0) {
      lossText = `−${fmtSEK(r.loss)}`;
      lossCls = 'neg';
    } else if (r.loss < 0) {
      lossText = `+${fmtSEK(Math.abs(r.loss))}`;
      lossCls = 'pos';
    } else {
      lossText = '—';
      lossCls = 'zero';
    }

    const row = document.createElement('div');
    row.className = 'fee-bar';
    row.innerHTML = `
      <div class="fee-bar-label">${feeStr}%</div>
      <div class="fee-bar-track">
        <div class="fee-bar-fill${highlightClass}" style="width: ${pct.toFixed(2)}%"></div>
        <span class="fee-bar-pct-inside">${pct.toFixed(1).replace('.', ',')} %</span>
      </div>
      <div class="fee-bar-amounts">
        <span class="fee-final">${fmtSEKsplit(r.finalVal)}</span>
        <span class="fee-loss ${lossCls}">${lossText}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderFireNumber(results) {
  if (!results || !lastInputs) return;
  const el = document.getElementById('fireMonthlyExpenses');
  if (!el) return;

  const monthlyExpenses = parseSwedish(el.value);
  const annualExpenses = monthlyExpenses * 12;

  // Current capital after the main simulation
  const currentCapital = results[currentRate].full.slice(-1)[0].value;

  // FIRE number using 4% rule, adjusted for ISK tax only.
  // The fund fee is NOT included here because it's already been deducted from
  // the accumulated capital during the saving phase. At withdrawal, the fee
  // no longer applies as an ongoing cost against the withdrawal rate —
  // we use the same logic as the "Per år / Per månad" withdrawal display above.
  //
  // Formula derivation:
  //   netAnnual = capital * 0.04 - max(0, capital - freeAmt) * taxPct
  //
  // Solving for capital when netAnnual = annualExpenses:
  //
  // If capital <= freeAmt (fully tax-free):
  //   capital = annualExpenses / 0.04
  //
  // If capital > freeAmt:
  //   capital * 0.04 - (capital - freeAmt) * taxPct = annualExpenses
  //   capital * (0.04 - taxPct) = annualExpenses - freeAmt * taxPct
  //   capital = (annualExpenses - freeAmt * taxPct) / (0.04 - taxPct)

  const withdrawalRate = 0.04;
  const taxPct = (lastInputs.tax || 0) / 100;
  const freeAmt = lastInputs.freeAmount || 0;

  let target;
  const taxFreeTarget = annualExpenses / withdrawalRate;
  if (taxFreeTarget <= freeAmt) {
    target = taxFreeTarget;
  } else {
    const denom = withdrawalRate - taxPct;
    if (denom <= 0) {
      target = Infinity;
    } else {
      target = (annualExpenses - freeAmt * taxPct) / denom;
    }
  }

  // Render target
  const targetEl = document.getElementById('fireNumberTarget');
  const targetSub = document.getElementById('fireNumberTargetSub');
  if (!isFinite(target) || target < 0) {
    targetEl.innerHTML = '<span class="num">—</span>';
    targetSub.textContent = 'Skatt + avgift överstiger uttagsprocenten';
  } else {
    targetEl.innerHTML = fmtSEKsplit(target);
    const multiple = target / annualExpenses;
    targetSub.textContent = `≈ ${multiple.toFixed(1).replace('.', ',')}× årsutgifter, inkl. ISK-skatt ${(taxPct*100).toFixed(3).replace('.', ',')} %`;
  }

  // Current capital display
  document.getElementById('fireNumberNow').innerHTML = fmtSEKsplit(currentCapital);
  const years = lastInputs.years || 0;
  const yearsLabel = Number.isInteger(years) ? `${years} år` : `${String(years).replace('.', ',')} år`;
  const nowLabel = document.getElementById('fireNumberNowLabel');
  if (nowLabel) nowLabel.textContent = `Ditt sparande efter ${yearsLabel}`;
  const progressEl = document.getElementById('fireNumberProgress');
  if (isFinite(target) && target > 0) {
    const pct = Math.min(100, (currentCapital / target) * 100);
    progressEl.textContent = `${pct.toFixed(1).replace('.', ',')} % av FIRE-nummer uppnått`;
  } else {
    progressEl.textContent = '';
  }

  // Savings-rate → years chart. Classic MMM table at 5% real return.
  const savingsData = [
    { rate: 10, years: '51 år' },
    { rate: 20, years: '37 år' },
    { rate: 30, years: '28 år' },
    { rate: 40, years: '22 år' },
    { rate: 50, years: '17 år' },
    { rate: 60, years: '12,5 år' },
    { rate: 70, years: '8,5 år' },
    { rate: 80, years: '5,5 år' },
    { rate: 90, years: 'ca 3 år' },
  ];

  const barsContainer = document.getElementById('fireSavingsBars');
  if (barsContainer && !barsContainer.dataset.rendered) {
    const maxYears = 51;
    barsContainer.innerHTML = savingsData.map(d => {
      // Parse numeric portion from years string for bar length
      const num = parseFloat(String(d.years).replace(',', '.'));
      const pct = Math.max(4, (num / maxYears) * 100);
      return `<div class="fsc-bar">
        <div class="fsc-bar-label">${d.rate}%</div>
        <div class="fsc-bar-track">
          <div class="fsc-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
          <span class="fsc-bar-years">${d.years}</span>
        </div>
      </div>`;
    }).join('');
    barsContainer.dataset.rendered = 'true';
  }

  // Savings-rate calculator: 3 fields → years to FIRE
  computeSavingsRateYears();
}

// Formula: years = ln(1 + 1.25 × (1-r)/r) / ln(1.05)
// where r is savings rate (0–1), assuming 5% real return and 4% rule
function yearsToFireByRate(rate) {
  if (rate <= 0) return Infinity;
  if (rate >= 1) return 0;
  const i = 0.05;
  const ratio = (1 - rate) / rate;
  return Math.log(1 + 1.25 * ratio) / Math.log(1 + i);
}

function computeSavingsRateYears() {
  const savingEl = document.getElementById('srcMonthlySaving');
  const salaryEl = document.getElementById('srcMonthlySalary');
  const resultEl = document.getElementById('srcYearsResult');
  const subEl = document.getElementById('srcRateSub');
  if (!savingEl || !salaryEl || !resultEl) return;

  const saving = parseSwedish(savingEl.value);
  const salary = parseSwedish(salaryEl.value);

  if (!salary || salary <= 0) {
    resultEl.textContent = '—';
    if (subEl) subEl.textContent = 'Ange din månadslön';
    return;
  }
  if (saving < 0) {
    resultEl.textContent = '—';
    if (subEl) subEl.textContent = '';
    return;
  }

  const rate = saving / salary;
  if (rate >= 1) {
    resultEl.textContent = '0';
    if (subEl) subEl.textContent = 'Sparkvot ≥ 100 %';
    return;
  }
  if (rate <= 0) {
    resultEl.textContent = '—';
    if (subEl) subEl.textContent = 'Inget sparande — aldrig ekonomiskt fri';
    return;
  }

  const years = yearsToFireByRate(rate);
  const ratePct = (rate * 100);
  const rateLabel = ratePct.toFixed(1).replace('.', ',');

  if (!isFinite(years) || years > 100) {
    resultEl.textContent = '—';
    if (subEl) subEl.textContent = `Sparkvot ${rateLabel} % — mer än 100 år`;
    return;
  }

  // Format: whole years if >= 10, otherwise one decimal
  const yearsText = years >= 10
    ? Math.round(years).toString()
    : years.toFixed(1).replace('.', ',');
  resultEl.textContent = yearsText;
  if (subEl) subEl.textContent = `Sparkvot ${rateLabel} %`;
}

function renderDetailed() {
  if (!lastResults) return;
  renderRateTabs();
  renderCompareTabs();
  renderSummaryCards(lastResults, lastInputs);
  renderChart(lastResults);
  renderTable(lastResults);
  renderFire(lastResults);
  renderFireNumber(lastResults);
  renderFee(lastResults);
}

function calculate() {
  const inputs = {
    start: parseSwedish(document.getElementById('start').value),
    monthly: parseSwedish(document.getElementById('monthly').value),
    years: parseSwedish(document.getElementById('years').value),
    tax: parseSwedish(document.getElementById('tax').value),
    freeAmount: parseSwedish(document.getElementById('freeAmount').value),
    fee: parseSwedish(document.getElementById('fee').value),
    monthlyIncrease: parseSwedish(document.getElementById('monthlyIncrease').value),
  };
  if (inputs.years <= 0) return;
  lastInputs = inputs;
  lastResults = runAll(inputs);
  renderDetailed();

  // On narrow screens, scroll to the results after clicking "Beräkna"
  if (window.innerWidth <= 900 && window._userTriggered) {
    const results = document.getElementById('results');
    if (results) {
      setTimeout(() => {
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }
  window._userTriggered = false;
}

// Attach formatting
document.querySelectorAll('input[data-format]').forEach(attachInputFormatting);

// Info icon: click-toggle for mobile/touch
document.querySelectorAll('.info-icon').forEach(icon => {
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.info-icon.open').forEach(o => {
      if (o !== icon) o.classList.remove('open');
    });
    icon.classList.toggle('open');
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.info-icon.open').forEach(o => o.classList.remove('open'));
});

// FIRE dropdown toggle
const fireToggle = document.getElementById('fireToggle');
const fireSection = document.getElementById('fireSection');
if (fireToggle && fireSection) {
  fireToggle.addEventListener('click', () => {
    const isOpen = fireSection.classList.toggle('open');
    fireToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

// Fee comparison toggle (closed by default)
const feeToggle = document.getElementById('feeToggle');
const feeSection = document.getElementById('feeSection');
if (feeToggle && feeSection) {
  feeToggle.addEventListener('click', () => {
    const isOpen = feeSection.classList.toggle('open');
    feeToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

// Advanced toggle
const advToggle = document.getElementById('advancedToggle');
const advBody = document.getElementById('advancedBody');
if (advToggle && advBody) {
  advToggle.addEventListener('click', () => {
    const isOpen = advBody.classList.toggle('open');
    advToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

// FIRE tax checkbox
const fireTaxCb = document.getElementById('fireTaxCheckbox');
if (fireTaxCb) {
  fireTaxCb.addEventListener('change', () => {
    if (lastResults) renderFire(lastResults);
  });
}

// FIRE number calculator toggle
const fireNumberToggle = document.getElementById('fireNumberToggle');
const fireNumberBody = document.getElementById('fireNumberBody');
if (fireNumberToggle && fireNumberBody) {
  fireNumberToggle.addEventListener('click', () => {
    const isOpen = fireNumberBody.classList.toggle('open');
    fireNumberToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

// Format + live-update the monthly-expenses input
const fireMonthlyInput = document.getElementById('fireMonthlyExpenses');
if (fireMonthlyInput) {
  attachInputFormatting(fireMonthlyInput);
  // Live update on every keystroke (in addition to change/enter which calls calculate)
  fireMonthlyInput.addEventListener('input', () => {
    if (lastResults) renderFireNumber(lastResults);
  });
}

// Savings-rate calculator (sparande / lön → år)
['srcMonthlySaving', 'srcMonthlySalary'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  attachInputFormatting(el);
  el.addEventListener('input', () => {
    computeSavingsRateYears();
  });
});
// Initial compute
computeSavingsRateYears();

// ===== Mobile tooltip handling =====
// On touch devices, tap to toggle + position the tooltip below the icon,
// clamped to the viewport.
(function setupMobileTooltips() {
  const isTouch = window.matchMedia('(hover: none)').matches;
  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  function positionTooltip(icon) {
    const tip = icon.querySelector('.tooltip');
    if (!tip) return;
    const iconRect = icon.getBoundingClientRect();
    const margin = 16;
    const vh = window.innerHeight;

    tip.style.left = margin + 'px';
    tip.style.right = margin + 'px';

    // Measure tooltip height (it's already rendered but maybe hidden)
    tip.style.top = '-9999px'; // move off-screen briefly to measure
    const tipHeight = tip.offsetHeight;

    const spaceBelow = vh - iconRect.bottom - margin;
    const spaceAbove = iconRect.top - margin;

    if (tipHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      // Place below icon
      tip.style.top = (iconRect.bottom + 10) + 'px';
    } else {
      // Place above icon
      tip.style.top = Math.max(margin, iconRect.top - tipHeight - 10) + 'px';
    }
    tip.style.bottom = 'auto';
  }

  function closeAll() {
    document.querySelectorAll('.info-icon.open').forEach(el => {
      el.classList.remove('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (!isNarrow()) return;
    const icon = e.target.closest('.info-icon');
    if (icon) {
      e.preventDefault();
      e.stopPropagation();
      const wasOpen = icon.classList.contains('open');
      closeAll();
      if (!wasOpen) {
        icon.classList.add('open');
        positionTooltip(icon);
      }
    } else {
      // Clicked outside any info-icon — close
      closeAll();
    }
  });

  // Re-position on scroll/resize while open
  window.addEventListener('scroll', () => {
    if (!isNarrow()) return;
    const open = document.querySelector('.info-icon.open');
    if (open) positionTooltip(open);
  }, { passive: true });

  window.addEventListener('resize', () => {
    const open = document.querySelector('.info-icon.open');
    if (open && isNarrow()) positionTooltip(open);
    else if (open) closeAll();
  });
})();

calculate();