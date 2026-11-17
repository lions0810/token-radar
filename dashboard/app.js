// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, compare: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and the fitted
  // power law in data.js (fit.a and fit.b at full precision, exactly the numbers main.ts scored
  // with) and checks the number board.json carries, so the page's code and the board's data are
  // visibly the same arithmetic: implied = round(exp(a) x tvl^b x growthMult x maturityMult).
  function impliedOf(row, model, fit) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(Math.exp(fit.a) * Math.pow(row.tvl_usd, fit.b) * growthMult * maturity));
  }

  // The starter baseline, recomputed in the page for the compare view: the flat 0.25 x TVL
  // with the same growth and maturity multipliers the row already carries in data.js, so the
  // only difference on screen is the pricing law itself. A row's flat rank is its place in the
  // whole board under that baseline, and the delta against its radar-2 rank is the visible
  // answer to "what does the power law actually change?".
  var FLAT_MULTIPLE = 0.25;
  function flatImpliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * FLAT_MULTIPLE * row.growth_multiplier * row.maturity_multiplier));
  }
  var flatRankCache = null;
  function flatRankOf(slug) {
    if (flatRankCache === null) {
      flatRankCache = {};
      DATA.rows
        .map(function (r) { return { slug: r.slug, flat: flatImpliedOf(r) }; })
        .sort(function (x, y) { return y.flat - x.flat || (x.slug < y.slug ? -1 : 1); })
        .forEach(function (r, i) { flatRankCache[r.slug] = i + 1; });
    }
    return flatRankCache[slug];
  }
  function compareCell(r) {
    var flatRank = flatRankOf(r.slug);
    var delta = flatRank - r.rank;
    var deltaText = delta === 0 ? 'same rank' : delta > 0 ? 'up ' + delta + ' vs flat' : 'down ' + (-delta) + ' vs flat';
    var deltaClass = delta === 0 ? 'sub' : delta > 0 ? 'pos' : 'neg';
    return el('td', null, el('div', { class: 'name' },
      el('b', { class: 'num', text: fmtUsd(flatImpliedOf(r)) }),
      el('span', { class: deltaClass, text: 'flat rank ' + flatRank + ' - ' + deltaText })
    ));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the ' + name + ' position on ' + chain + ' each week and repay it, so supply and borrow activity both count.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount through ' + name + "'s main pool on " + chain + ' each week and add the proceeds back to the position.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount to ' + chain + ' through ' + name + ' each week and use the bridged funds in its app the same day.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the ' + name + ' staking rewards on ' + chain + ' each week and restake them so the staked balance keeps growing.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small hedged trade on ' + name + ' each week so both volume and time in the market register.';
    if (c.indexOf('prediction') >= 0) return 'Place one small position on a new ' + name + ' market each week and settle it before it expires.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Add a small amount to the ' + name + ' vault on ' + chain + ' each week so the share balance and the deposit history both grow.';
    if (c.indexOf('stable') >= 0) return 'Mint or redeem a small amount of the stable asset through ' + name + ' on ' + chain + ' each week and hold the rest.';
    if (c.indexOf('rwa') >= 0) return 'Add a small amount to the ' + name + ' yield position on ' + chain + ' each week and keep the receipt with the first mint.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the ' + name + ' cover on ' + chain + ' each week so the policy never lapses.';
    return 'Repeat the ' + name + ' deposit on ' + chain + ' each week with a small amount so the activity is spread over time, not done in one day.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet on ' + chain + ' that holds only the funds you plan to farm ' + p.name + ' with, fund it for ' + chain + ' gas, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the ' + p.name + ' position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + "'s own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the ' + chain + ' dates and every ' + p.name + ' transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      // The filter list names a missing category 'Other', so compare against the same
      // normalised label here: comparing the raw null category would make 'Other' match nothing.
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var f = DATA.fit;
    var looGain = Math.round((1 - f.loo_mean_abs_log_error / f.flat_025_mean_abs_log_error) * 100);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'Every one of the ' + DATA.watchlist_size + ' watchlist protocols is covered: the watchlist is the floor, every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value comes from a power law fitted to tokens that already trade, not from a flat multiple of TVL. It is a model, not a promise.' }),
        el('p', { class: 'verdict', text: 'Validated out of sample: leave-one-out error ' + f.loo_mean_abs_log_error.toFixed(3) + ' for the fitted power law against ' + f.flat_025_mean_abs_log_error.toFixed(3) + ' for flat 0.25 x TVL, ' + looGain + '% lower, on the same ' + f.n + ' live-token protocols. Full model below the board summary, before the table.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Power law fitted on' }), el('b', { text: f.n + ' live tokens' })),
        el('div', { class: 'fact' }, el('span', { text: 'LOO error, power law vs flat' }), el('b', { text: f.loo_mean_abs_log_error.toFixed(3) + ' vs ' + f.flat_025_mean_abs_log_error.toFixed(3) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    // Search and category filter the pre-token board only. On the Live token tab they used to
    // stay live and silently do nothing, so disable them there and say so in the count line.
    if (state.tab === 'live') {
      search.setAttribute('disabled', '');
      select.setAttribute('disabled', '');
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    // The compare toggle adds the flat-baseline column to the pre-token board. It belongs to
    // that board alone, so on the Live token tab it is disabled like search and category.
    var compare = el('button', { type: 'button', 'aria-pressed': state.compare ? 'true' : 'false', text: state.compare ? 'On' : 'Off', onclick: function () { state.compare = !state.compare; render(); } });
    if (state.tab === 'live') compare.setAttribute('disabled', '');
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Compare flat 0.25x' }), el('div', { class: 'tabs' }, compare)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols (search and category apply to the pre-token board)' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    // Bars are shares of the whole board's top implied value, not of whatever row the current
    // sort happens to put first: with a name or TVL sort the first row is not the maximum, and
    // the old code drew bars over 100% or shrunk them all.
    var max = DATA.rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' + (r.rank <= 3 ? ' rank-top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        state.compare ? compareCell(r) : null,
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var caption = state.sort === 'implied' && state.dir < 0
      ? 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.'
      : 'Pre-token protocols, sorted by the column you picked; Rank is the implied-value rank. Select a row for its model and farm plan.';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: caption }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Rank' }),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            state.compare ? el('th', { scope: 'col', text: 'Flat 0.25x baseline' }) : null,
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var looGain = Math.round((1 - f.loo_mean_abs_log_error / f.flat_025_mean_abs_log_error) * 100);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'The model: a fitted power law, validated out of sample' }),
      el('p', { class: 'verdict', text: 'Radar-2 does not price a pre-token protocol at a flat share of its TVL. It fits how tokens that already trade are actually priced, then applies that law. Leave-one-out validation on the fit sample: power law ' + f.loo_mean_abs_log_error.toFixed(3) + ' mean log error, flat 0.25 x TVL ' + f.flat_025_mean_abs_log_error.toFixed(3) + ' — the fitted law is ' + looGain + '% more accurate out of sample.' }),
      el('div', { class: 'validation' },
        el('div', { class: 'vstat' }, el('span', { text: 'Fitted power law' }), el('b', { text: 'a = ' + f.a.toFixed(3) + ', b = ' + f.b.toFixed(3) }), el('span', { class: 'sub', text: 'log(market cap) = a + b x log(TVL)' })),
        el('div', { class: 'vstat' }, el('span', { text: 'Fit sample' }), el('b', { text: 'n = ' + f.n + ' live tokens' }), el('span', { class: 'sub', text: 'mcap and TVL above zero, mcap/TVL 0.001 to 20, R-squared ' + f.r_squared.toFixed(3) })),
        el('div', { class: 'vstat' }, el('span', { text: 'LOO error, power law' }), el('b', { text: f.loo_mean_abs_log_error.toFixed(3) + ' mean' }), el('span', { class: 'sub', text: 'median ' + f.loo_median_abs_log_error.toFixed(3) + ', each protocol held out and refitted' })),
        el('div', { class: 'vstat' }, el('span', { text: 'LOO error, flat 0.25 x TVL' }), el('b', { text: f.flat_025_mean_abs_log_error.toFixed(3) + ' mean' }), el('span', { class: 'sub', text: 'median ' + f.flat_025_median_abs_log_error.toFixed(3) + ', the starter baseline on the same protocols' }))
      ),
      el('div', { class: 'formula' },
        'implied = round( exp(a) x tvl_usd^b x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') ), with a = ' + f.a.toFixed(4) + ' and b = ' + f.b.toFixed(4)
      ),
      el('p', { class: 'sub', text: 'Every row is scored by this one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. Because b is below 1, implied value grows slower than TVL: a protocol ten times larger is priced about ' + Math.pow(10, f.b).toFixed(1) + ' times higher, not ten times, which is why this board is not just the TVL table re-sorted.' }),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown. Open any row: the page recomputes its implied value from these same numbers and checks it against the board.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Power-law base, exp(a) x TVL^b' }), el('b', { class: 'num', text: fmtUsd(Math.exp(DATA.fit.a) * Math.pow(row.tvl_usd, DATA.fit.b)) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Implied as share of TVL' }), el('b', { class: 'num', text: (row.tvl_usd > 0 ? (row.implied_value_usd / row.tvl_usd * 100).toFixed(1) + '%' : 'n/a') }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ' (power law a = ' + DATA.fit.a.toFixed(4) + ', b = ' + DATA.fit.b.toFixed(4) + ', fitted on n = ' + DATA.fit.n + ' live-token protocols): the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model, DATA.fit)) + (impliedOf(row, DATA.model, DATA.fit) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'Built for ' + row.name + ' alone: a ' + (row.category || 'Other') + ' action on ' + chainOf(row) + ', $' + capitalFor(row) + ' of capital, held at least ' + holdDaysFor(row.age_days) + ' days. Every step names this protocol, its chain or its category action.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    // The model panel used to sit under a 200-row table, where a reader comparing two
    // dashboards would never reach it. It now sits directly above the board it explains.
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
