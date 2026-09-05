
  var navEl = document.querySelector('.nav');
  window.addEventListener('scroll', function () {
    var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var pct = h > 0 ? (window.scrollY / h) * 100 : 0;
    document.getElementById('scroll-progress').style.width = pct + '%';
    navEl.classList.toggle('scrolled', window.scrollY > 8);
  });

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  function positionTabIndicator(btn) {
    var row = document.getElementById('tabsRow');
    var indicator = document.getElementById('tabIndicator');
    if (!row || !indicator || !btn) return;
    var rowRect = row.getBoundingClientRect();
    var btnRect = btn.getBoundingClientRect();
    indicator.style.width = btnRect.width + 'px';
    indicator.style.transform = 'translateX(' + (btnRect.left - rowRect.left) + 'px)';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('active'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el) { obs.observe(el); });

    positionTabIndicator(document.querySelector('.tab-btn.active'));

    if (finePointer && !reducedMotion) {
      var heroEl = document.querySelector('.hero');
      if (heroEl) {
        heroEl.addEventListener('mousemove', function (e) {
          var r = heroEl.getBoundingClientRect();
          heroEl.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
          heroEl.style.setProperty('--sy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        });
      }

      var mockWrap = document.querySelector('.mock-wrap');
      var mockEl = document.querySelector('.mock');
      if (mockWrap && mockEl) {
        mockWrap.addEventListener('mousemove', function (e) {
          var r = mockWrap.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          mockEl.style.transform = 'rotateX(' + (py * -4).toFixed(2) + 'deg) rotateY(' + (px * 6).toFixed(2) + 'deg)';
        });
        mockWrap.addEventListener('mouseleave', function () {
          mockEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
        });
      }
    }

    // Live booking ticker — cycles a couple of honest, generic examples;
    // never claims a specific real customer's data.
    var tickerMessages = [
      { t1: 'New booking · 30 Min Product Tour', t2: 'via calendar.hudumika.tz/book' },
      { t1: 'Bliss video room attached', t2: 'Quarterly Review · 09:00' },
      { t1: 'Synced from Google Calendar', t2: 'Customs Workflow Sync · 14:00' }
    ];
    var tickerEl = document.createElement('div');
    tickerEl.className = 'ticker';
    tickerEl.innerHTML = '<span class="dot"></span><span><span id="tickerT1"></span><span class="t2" id="tickerT2"></span></span>';
    document.body.appendChild(tickerEl);
    var ti = 0;
    function showTicker() {
      var m = tickerMessages[ti % tickerMessages.length];
      document.getElementById('tickerT1').textContent = m.t1;
      document.getElementById('tickerT2').textContent = m.t2;
      tickerEl.classList.remove('show');
      void tickerEl.offsetWidth;
      tickerEl.classList.add('show');
      ti++;
      setTimeout(function () { tickerEl.classList.remove('show'); }, 4200);
    }
    setTimeout(showTicker, 1800);
    setInterval(showTicker, 7000);
  });

  function switchTab(i) {
    var activeBtn = null;
    document.querySelectorAll('.tab-btn').forEach(function (b, idx) {
      b.classList.toggle('active', idx === i);
      if (idx === i) activeBtn = b;
    });
    document.querySelectorAll('.tab-item').forEach(function (p, idx) { p.classList.toggle('active', idx === i); });
    positionTabIndicator(activeBtn);
  }

  function pickSlot(btn) {
    document.querySelectorAll('.slot-row').forEach(function (r) { r.classList.remove('open'); });
    document.querySelectorAll('.slot-btn').forEach(function (b) { b.classList.remove('chosen'); });
    btn.classList.add('chosen');
    btn.closest('.slot-row').classList.add('open');
  }

  function confirmSlot(btn) {
    var row = btn.closest('.slot-row');
    var time = row.getAttribute('data-time');
    document.getElementById('slots').style.display = 'none';
    document.getElementById('bookForm').style.display = 'flex';
    document.getElementById('pickedNote').textContent = 'Selected: Thursday, Sep 5 at ' + time;
  }

  function submitBooking() {
    document.getElementById('bookForm').style.display = 'none';
    document.getElementById('bookSuccess').style.display = 'block';
  }

  function toggleFaq(btn) {
    var item = btn.closest('.faq-item');
    var wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(function (i) { i.classList.remove('open'); });
    if (!wasOpen) item.classList.add('open');
  }
