(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuList = document.getElementById('menu-list');
  const menuDropdowns = menuList ? menuList.querySelectorAll('.menu-dropdown') : [];
  const fontDecreaseBtn = document.getElementById('font-decrease');
  const fontIncreaseBtn = document.getElementById('font-increase');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const siteHeader = document.querySelector('.site-header');
  const mainElement = document.querySelector('main');
  const pageSections = Array.from(document.querySelectorAll('main section[id]'));
  const navSectionLinks = menuList ? Array.from(menuList.querySelectorAll('a[href^="#"]')) : [];
  const internalAnchorLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
  const FONT_SCALE_KEY = 'portal_font_scale';
  const THEME_KEY = 'portal_theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  const PORTAL_MODE_ENABLED = true;
  const PORTAL_ACTIVE_CLASS = 'is-portal-active';
  const PORTAL_NAV_DEBOUNCE_MS = 420;
  const FONT_SCALE_MIN = 0.9;
  const FONT_SCALE_MAX = 1.25;
  const FONT_SCALE_STEP = 0.05;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const closeMenuDropdowns = () => {
    menuDropdowns.forEach((dropdown) => {
      dropdown.removeAttribute('open');
    });
  };

  const syncHeaderHeight = () => {
    if (!siteHeader) return;
    document.documentElement.style.setProperty('--header-height', `${siteHeader.offsetHeight}px`);
  };

  const setActiveSectionLink = (sectionId) => {
    navSectionLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const isActive = href === `#${sectionId}`;
      link.classList.toggle('is-active-link', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const getNearestSectionId = () => {
    if (!pageSections.length) return null;

    const headerHeight = siteHeader ? siteHeader.offsetHeight : 0;
    let nearestId = pageSections[0].id;
    let nearestDistance = Number.POSITIVE_INFINITY;

    pageSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const distance = Math.abs(rect.top - headerHeight - 12);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = section.id;
      }
    });

    return nearestId;
  };

  const getSectionIndexById = (sectionId) => pageSections.findIndex((section) => section.id === sectionId);
  let portalSectionIndex = pageSections.length ? 0 : -1;
  let lastPortalNavigationAt = 0;
  let touchStartY = null;

  const setPortalActiveSection = (sectionId, options = {}) => {
    if (!pageSections.length) return;

    const { updateHash = true, behavior = 'auto' } = options;
    const targetIndex = getSectionIndexById(sectionId);
    if (targetIndex < 0) return;

    portalSectionIndex = targetIndex;

    pageSections.forEach((section, index) => {
      const isActive = index === targetIndex;
      section.classList.toggle(PORTAL_ACTIVE_CLASS, isActive);
      section.setAttribute('aria-hidden', String(!isActive));
    });

    const targetSection = pageSections[targetIndex];
    setActiveSectionLink(targetSection.id);

    if (portalModeEnabled) {
      targetSection.scrollTop = 0;
    } else {
      targetSection.scrollIntoView({ behavior, block: 'start' });
    }

    if (updateHash && window.history.replaceState) {
      window.history.replaceState(null, '', `#${targetSection.id}`);
    }
  };

  const movePortalSection = (direction) => {
    if (!portalModeEnabled || pageSections.length <= 1) return;

    const now = Date.now();
    if (now - lastPortalNavigationAt < PORTAL_NAV_DEBOUNCE_MS) return;
    lastPortalNavigationAt = now;

    const nextIndex = Math.max(0, Math.min(pageSections.length - 1, portalSectionIndex + direction));
    if (nextIndex === portalSectionIndex) return;

    setPortalActiveSection(pageSections[nextIndex].id, { updateHash: true, behavior: 'auto' });
  };

  if (menuToggle && menuList) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      const nextState = !expanded;
      menuToggle.setAttribute('aria-expanded', String(nextState));
      menuToggle.setAttribute('aria-label', nextState ? 'Fechar menu' : 'Abrir menu');
      menuList.classList.toggle('open', nextState);
      if (!nextState) {
        closeMenuDropdowns();
      }
    });

    menuList.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeMenuDropdowns();
        if (window.innerWidth <= 920) {
          menuToggle.setAttribute('aria-expanded', 'false');
          menuToggle.setAttribute('aria-label', 'Abrir menu');
          menuList.classList.remove('open');
        }
      });
    });

    document.addEventListener('click', (event) => {
      const isInsideMenu = menuList.contains(event.target) || menuToggle.contains(event.target);
      if (!isInsideMenu) {
        closeMenuDropdowns();
        if (window.innerWidth <= 920) {
          menuToggle.setAttribute('aria-expanded', 'false');
          menuToggle.setAttribute('aria-label', 'Abrir menu');
          menuList.classList.remove('open');
        }
      }
    });
  }

  const applyFontScale = (nextScale) => {
    const safeScale = clamp(nextScale, FONT_SCALE_MIN, FONT_SCALE_MAX);
    document.documentElement.style.fontSize = `${Math.round(safeScale * 100)}%`;
    try {
      window.localStorage.setItem(FONT_SCALE_KEY, String(safeScale));
    } catch (err) {
      return;
    }
  };

  let currentFontScale = 1;
  try {
    const savedScale = Number(window.localStorage.getItem(FONT_SCALE_KEY));
    if (Number.isFinite(savedScale) && savedScale >= FONT_SCALE_MIN && savedScale <= FONT_SCALE_MAX) {
      currentFontScale = savedScale;
    }
  } catch (err) {
    currentFontScale = 1;
  }

  applyFontScale(currentFontScale);

  if (fontDecreaseBtn) {
    fontDecreaseBtn.addEventListener('click', () => {
      currentFontScale = clamp(currentFontScale - FONT_SCALE_STEP, FONT_SCALE_MIN, FONT_SCALE_MAX);
      applyFontScale(currentFontScale);
    });
  }

  if (fontIncreaseBtn) {
    fontIncreaseBtn.addEventListener('click', () => {
      currentFontScale = clamp(currentFontScale + FONT_SCALE_STEP, FONT_SCALE_MIN, FONT_SCALE_MAX);
      applyFontScale(currentFontScale);
    });
  }

  const detectInitialTheme = () => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_KEY);
      if (savedTheme === THEME_LIGHT || savedTheme === THEME_DARK) {
        return savedTheme;
      }
    } catch (err) {
      return THEME_LIGHT;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
  };

  const applyTheme = (theme) => {
    const nextTheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
    const isDark = nextTheme === THEME_DARK;
    document.body.classList.toggle('theme-dark', isDark);

    if (themeToggleBtn) {
      themeToggleBtn.setAttribute('aria-pressed', String(isDark));
      themeToggleBtn.setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
      themeToggleBtn.setAttribute('title', isDark ? 'Tema escuro ativo' : 'Tema claro ativo');
    }

    try {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    } catch (err) {
      return;
    }
  };

  applyTheme(detectInitialTheme());

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const darkEnabled = document.body.classList.contains('theme-dark');
      applyTheme(darkEnabled ? THEME_LIGHT : THEME_DARK);
    });
  }

  const portalModeEnabled = PORTAL_MODE_ENABLED;
  document.body.classList.toggle('portal-mode', portalModeEnabled);
  if (portalModeEnabled) {
    const hashId = window.location.hash ? window.location.hash.slice(1) : '';
    const targetId = hashId && getSectionIndexById(hashId) >= 0 ? hashId : (pageSections[0]?.id || '');
    if (targetId) {
      setPortalActiveSection(targetId, { updateHash: Boolean(targetId), behavior: 'auto' });
    }
  }

  internalAnchorLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#') || href.length <= 1) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;

      event.preventDefault();
      if (portalModeEnabled) {
        setPortalActiveSection(target.id, { updateHash: true, behavior: 'auto' });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSectionLink(target.id);

        if (window.history.replaceState) {
          window.history.replaceState(null, '', `#${target.id}`);
        }
      }
    });
  });

  let navSyncFrame = null;

  const syncCurrentSectionByScroll = () => {
    navSyncFrame = null;
    if (portalModeEnabled) return;
    const nearestSectionId = getNearestSectionId();
    if (!nearestSectionId) return;
    setActiveSectionLink(nearestSectionId);
  };

  const scheduleSectionSync = () => {
    if (navSyncFrame !== null) return;
    navSyncFrame = window.requestAnimationFrame(syncCurrentSectionByScroll);
  };

  if (mainElement) {
    mainElement.addEventListener('scroll', scheduleSectionSync, { passive: true });
    mainElement.addEventListener('wheel', (event) => {
      if (!portalModeEnabled) return;
      if (Math.abs(event.deltaY) < 8) return;
      event.preventDefault();
      movePortalSection(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    mainElement.addEventListener('touchstart', (event) => {
      if (!portalModeEnabled) return;
      touchStartY = event.touches[0]?.clientY ?? null;
    }, { passive: true });

    mainElement.addEventListener('touchend', (event) => {
      if (!portalModeEnabled || touchStartY === null) return;
      const touchEndY = event.changedTouches[0]?.clientY ?? touchStartY;
      const deltaY = touchStartY - touchEndY;
      touchStartY = null;
      if (Math.abs(deltaY) < 36) return;
      movePortalSection(deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }
  window.addEventListener('scroll', scheduleSectionSync, { passive: true });

  let wasLandscapeMobile = null;

  const applyMobileLandscapeViewport = (source = 'resize') => {
    syncHeaderHeight();
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    const isLandscapeMobile = window.matchMedia('(max-width: 920px) and (orientation: landscape)').matches;
    document.body.classList.toggle('landscape-mobile', isLandscapeMobile);

    // Avoid forced scroll on every resize: it causes jump-to-top while the user scrolls.
    const justEnteredLandscape = isLandscapeMobile && wasLandscapeMobile !== true;
    const canAttemptHideBars = source === 'load' || source === 'orientationchange';

    if (justEnteredLandscape && canAttemptHideBars && !portalModeEnabled) {
      window.setTimeout(() => {
        if (window.scrollY <= 2) {
          window.scrollTo(0, 1);
        }
      }, 80);
    }

    wasLandscapeMobile = isLandscapeMobile;
  };

  applyMobileLandscapeViewport('load');
  window.addEventListener('resize', () => applyMobileLandscapeViewport('resize'));
  window.addEventListener('orientationchange', () => applyMobileLandscapeViewport('orientationchange'));
  window.addEventListener('load', () => applyMobileLandscapeViewport('load'));

  const initialHashId = window.location.hash ? window.location.hash.slice(1) : '';
  const initialHashTarget = initialHashId ? document.getElementById(initialHashId) : null;
  if (initialHashTarget) {
    window.setTimeout(() => {
      if (portalModeEnabled) {
        setPortalActiveSection(initialHashTarget.id, { updateHash: true, behavior: 'auto' });
      } else {
        initialHashTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
        setActiveSectionLink(initialHashTarget.id);
      }
    }, 0);
  } else if (pageSections.length) {
    if (portalModeEnabled) {
      setPortalActiveSection(pageSections[0].id, { updateHash: false, behavior: 'auto' });
    } else {
      setActiveSectionLink(pageSections[0].id);
    }
  }

  window.addEventListener('hashchange', () => {
    const hashId = window.location.hash ? window.location.hash.slice(1) : '';
    const target = hashId ? document.getElementById(hashId) : null;
    if (!target) return;

    if (portalModeEnabled) {
      setPortalActiveSection(target.id, { updateHash: false, behavior: 'auto' });
    } else {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      setActiveSectionLink(target.id);
    }
  });

  if (!portalModeEnabled) {
    scheduleSectionSync();
  }

  const youtubeEmbed = document.querySelector('[data-youtube-embed]');
  const videoFallback = document.querySelector('[data-video-fallback]');

  const showVideoFallback = () => {
    if (videoFallback) {
      videoFallback.hidden = false;
    }
  };

  if (youtubeEmbed && videoFallback) {
    if (window.location.protocol === 'file:') {
      showVideoFallback();
    }

    youtubeEmbed.addEventListener('error', showVideoFallback);

    window.addEventListener('message', (event) => {
      try {
        const hostname = new URL(event.origin).hostname;
        const isYoutubeOrigin = hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com');
        if (!isYoutubeOrigin) return;

        const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        if (payload.includes('"error":153') || payload.includes('"errorCode":153')) {
          showVideoFallback();
        }
      } catch (err) {
        return;
      }
    });
  }

  const storyData = {
    origem: {
      eyebrow: 'Capitulo 1',
      title: 'Mater Ter Admirabilis',
      text: 'A expressao "Tres Vezes Admiravel" vem da tradicao mariana e ganhou destaque em Ingolstadt. Em Schoenstatt, o titulo passa a ser vivido como caminho pedagogico de alianca com Maria.',
      meta: 'Raiz historica: Ingolstadt, sec. XVII'
    },
    alianca: {
      eyebrow: 'Capitulo 2',
      title: 'Alianca de Amor em Schoenstatt',
      text: 'Em 18 de outubro de 1914, nasce a Alianca de Amor no Santuario Original. Essa experiencia marca o inicio da espiritualidade de Schoenstatt e seu modo proprio de viver com Maria.',
      meta: 'Marco historico: 18/10/1914'
    },
    nome: {
      eyebrow: 'Capitulo 3',
      title: 'Mae e Rainha Tres Vezes Admiravel',
      text: 'Entre 1915 e 1916, com a presenca da imagem da MTA no Santuario, o titulo mariano vai sendo consolidado na vida do movimento: Maria como Mae, Rainha e educadora dos coracoes.',
      meta: 'Consolidacao do titulo: 1915-1916'
    },
    peregrina: {
      eyebrow: 'Capitulo 4',
      title: 'Da capela para as familias',
      text: 'Em 1950, Joao Pozzobon inicia a Campanha da Mae Peregrina no Brasil. A imagem sai em missao e a espiritualidade chega as casas, aos doentes e aos grupos de terco.',
      meta: 'Campanha da Mae Peregrina: desde 1950'
    },
    hoje: {
      eyebrow: 'Capitulo 5',
      title: 'O chamado de hoje',
      text: 'Rezar o terco com a Mae Rainha e renovar a alianca no cotidiano: familia, trabalho, comunidade e missao. A historia continua quando a oracao se torna vida concreta.',
      meta: 'Aplicacao pastoral: comunidade e familia'
    }
  };

  const storyTabs = document.querySelectorAll('.story-tab');
  const storyEyebrow = document.getElementById('story-eyebrow');
  const storyTitle = document.getElementById('story-title');
  const storyText = document.getElementById('story-text');
  const storyMeta = document.getElementById('story-meta');

  const applyStory = (storyId) => {
    const payload = storyData[storyId];
    if (!payload || !storyEyebrow || !storyTitle || !storyText || !storyMeta) return;

    storyEyebrow.textContent = payload.eyebrow;
    storyTitle.textContent = payload.title;
    storyText.textContent = payload.text;
    storyMeta.textContent = payload.meta;

    storyTabs.forEach((tab) => {
      const active = tab.dataset.storyId === storyId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  };

  if (storyTabs.length) {
    storyTabs.forEach((tab) => {
      tab.addEventListener('click', () => applyStory(tab.dataset.storyId));
    });

    const defaultTab = Array.from(storyTabs).find((tab) => tab.classList.contains('is-active')) || storyTabs[0];
    if (defaultTab) {
      applyStory(defaultTab.dataset.storyId);
    }
  }

  const mysteryByDay = {
    0: {
      day: 'Domingo',
      title: 'Misterios Gloriosos',
      items: [
        'Ressurreicao de Jesus',
        'Ascensao do Senhor',
        'Vinda do Espirito Santo',
        'Assuncao de Maria',
        'Coroacao de Maria'
      ]
    },
    1: {
      day: 'Segunda-feira',
      title: 'Misterios Gozosos',
      items: [
        'Anunciacao do Anjo',
        'Visitacao de Maria',
        'Nascimento de Jesus',
        'Apresentacao no Templo',
        'Perda e Encontro de Jesus'
      ]
    },
    2: {
      day: 'Terca-feira',
      title: 'Misterios Dolorosos',
      items: [
        'Agonia de Jesus',
        'Flagelacao',
        'Coroacao de espinhos',
        'Jesus carrega a cruz',
        'Crucificacao e morte'
      ]
    },
    3: {
      day: 'Quarta-feira',
      title: 'Misterios Gloriosos',
      items: [
        'Ressurreicao de Jesus',
        'Ascensao do Senhor',
        'Vinda do Espirito Santo',
        'Assuncao de Maria',
        'Coroacao de Maria'
      ]
    },
    4: {
      day: 'Quinta-feira',
      title: 'Misterios Luminosos',
      items: [
        'Batismo no Jordao',
        'Bodas de Cana',
        'Anuncio do Reino',
        'Transfiguracao',
        'Instituicao da Eucaristia'
      ]
    },
    5: {
      day: 'Sexta-feira',
      title: 'Misterios Dolorosos',
      items: [
        'Agonia de Jesus',
        'Flagelacao',
        'Coroacao de espinhos',
        'Jesus carrega a cruz',
        'Crucificacao e morte'
      ]
    },
    6: {
      day: 'Sabado',
      title: 'Misterios Gozosos',
      items: [
        'Anunciacao do Anjo',
        'Visitacao de Maria',
        'Nascimento de Jesus',
        'Apresentacao no Templo',
        'Perda e Encontro de Jesus'
      ]
    }
  };

  const mysteryMeditations = {
    'Anunciacao do Anjo': 'Maria acolhe o plano de Deus com um "sim" total. Neste misterio, pedimos a graca da docilidade para ouvir, discernir e responder ao chamado do Senhor.',
    'Visitacao de Maria': 'Maria leva Jesus a Isabel e serve com alegria. Rezamos por coracoes missionarios, prontos para ir ao encontro dos irmaos com caridade concreta.',
    'Nascimento de Jesus': 'Contemplamos o Filho de Deus que nasce pobre em Belem. Pedimos humildade, simplicidade e fe para reconhecer Cristo presente no cotidiano.',
    'Apresentacao no Templo': 'Maria e Jose apresentam Jesus ao Pai. Oferecemos nossa familia a Deus e pedimos fidelidade para viver cada etapa da vida em obediencia amorosa.',
    'Perda e Encontro de Jesus': 'Maria procura Jesus com perseveranca ate encontra-lo no Templo. Rezamos para nunca desistir da busca por Deus, especialmente nos tempos de prova.',
    'Agonia de Jesus': 'No Horto das Oliveiras, Jesus entrega-se a vontade do Pai. Pedimos fortaleza para confiar em Deus nas angustias e permanecer fieis na oracao.',
    'Flagelacao': 'Jesus sofre por amor a humanidade. Oferecemos nossas dores e pedimos cura interior, pureza de coracao e conversao verdadeira.',
    'Coroacao de espinhos': 'O Rei e humilhado e coroado com espinhos. Pedimos humildade para rejeitar o orgulho e viver com mansidao e paciencia.',
    'Jesus carrega a cruz': 'Cristo assume a cruz no caminho do Calvario. Rezamos para carregar nossas cruzes com esperanca e ajudar quem esta cansado no caminho.',
    'Crucificacao e morte': 'Jesus entrega a vida na cruz para nossa salvacao. Contemplamos o amor extremo de Deus e pedimos graca para perdoar e amar sem medida.',
    'Ressurreicao de Jesus': 'Cristo vence a morte e abre para nos a vida nova. Pedimos renovacao da fe e alegria pascal para testemunhar a esperanca.',
    'Ascensao do Senhor': 'Jesus sobe aos ceus e envia os discipulos em missao. Rezamos por ardor apostolico para anunciar o Evangelho com coragem.',
    'Vinda do Espirito Santo': 'No Cenaculo, Maria reza com a Igreja e o Espirito e derramado. Pedimos seus dons para viver santidade e unidade.',
    'Assuncao de Maria': 'Maria e elevada ao ceu em corpo e alma. Contemplamos nossa vocacao a eternidade e pedimos perseveranca na caminhada.',
    'Coroacao de Maria': 'Maria e coroada Rainha do ceu e da terra. Entregamos nossa vida a sua intercessao e pedimos fidelidade a Alianca de Amor.',
    'Batismo no Jordao': 'No Jordao, o Pai revela Jesus como Filho amado. Pedimos graca de renovar nossa identidade batismal e viver como filhos de Deus.',
    'Bodas de Cana': 'Maria intercede e Jesus realiza o sinal em Cana. Rezamos por familias e comunidades para viverem a confianca e a obediencia a Cristo.',
    'Anuncio do Reino': 'Jesus chama todos a conversao e revela o Reino. Pedimos coracao aberto para viver o Evangelho em cada escolha diaria.',
    'Transfiguracao': 'No monte, a gloria de Cristo se manifesta aos discipulos. Pedimos luz para manter a fe, mesmo diante da cruz e das incertezas.',
    'Instituicao da Eucaristia': 'Na ultima ceia, Jesus entrega seu Corpo e Sangue. Suplicamos amor a Eucaristia e desejo de comunhao com Deus e com os irmaos.'
  };

  const mysteryModal = document.getElementById('mystery-modal');
  const mysteryModalTitle = document.getElementById('mystery-modal-title');
  const mysteryModalText = document.getElementById('mystery-modal-text');
  const mysteryModalGroup = document.getElementById('mystery-modal-group');
  const mysteryModalCloseButtons = document.querySelectorAll('[data-mystery-modal-close]');
  let lastFocusedMystery = null;

  const openMysteryModal = (title, group) => {
    if (!mysteryModal || !mysteryModalTitle || !mysteryModalText || !mysteryModalGroup) return;

    const meditation = mysteryMeditations[title] || 'Meditacao em preparacao. Em breve o texto completo deste misterio estara disponivel.';
    mysteryModalTitle.textContent = title;
    mysteryModalText.textContent = meditation;
    mysteryModalGroup.textContent = group || 'Misterio do Terco';
    mysteryModal.classList.add('open');
    mysteryModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-modal-open');
  };

  const closeMysteryModal = () => {
    if (!mysteryModal) return;
    mysteryModal.classList.remove('open');
    mysteryModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-modal-open');
    if (lastFocusedMystery) {
      lastFocusedMystery.focus();
      lastFocusedMystery = null;
    }
  };

  const bindMysteryItem = (element) => {
    if (!element || element.dataset.mysteryBound === '1') return;

    element.dataset.mysteryBound = '1';
    element.classList.add('mystery-interactive');
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');

    const handleOpen = () => {
      const title = element.textContent.trim();
      const fallbackGroup = element.closest('.mystery-card')?.querySelector('h3')?.textContent?.trim();
      const group = element.dataset.mysteryGroup || fallbackGroup || 'Misterio do Terco';
      lastFocusedMystery = element;
      openMysteryModal(title, group);
    };

    element.addEventListener('click', handleOpen);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleOpen();
      }
    });
  };

  if (mysteryModalCloseButtons.length) {
    mysteryModalCloseButtons.forEach((button) => {
      button.addEventListener('click', closeMysteryModal);
    });
  }

  const daySlot = mysteryByDay[new Date().getDay()];
  const titleEl = document.getElementById('today-mystery-title');
  const dayEl = document.getElementById('today-mystery-day');
  const listEl = document.getElementById('today-mystery-list');

  if (daySlot && titleEl && dayEl && listEl) {
    titleEl.textContent = daySlot.title;
    dayEl.textContent = daySlot.day;
    listEl.innerHTML = '';
    daySlot.items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      li.dataset.mysteryGroup = daySlot.title;
      listEl.appendChild(li);
    });
  }

  document.querySelectorAll('.mystery-card li, #today-mystery-list li').forEach(bindMysteryItem);

  const accordions = document.querySelectorAll('[data-accordion]');

  const setAccordionState = (card, open) => {
    const button = card.querySelector('[data-accordion-trigger]');
    const body = card.querySelector('[data-accordion-body]');
    if (!button || !body) return;

    const closedLabel = button.dataset.closedLabel || 'Ver';
    const openLabel = button.dataset.openLabel || 'Ocultar';

    card.classList.toggle('open', open);
    body.style.maxHeight = open ? `${body.scrollHeight}px` : '0px';
    button.textContent = open ? openLabel : closedLabel;
    button.setAttribute('aria-expanded', String(open));
  };

  accordions.forEach((card) => {
    const button = card.querySelector('[data-accordion-trigger]');
    if (!button) return;

    setAccordionState(card, false);

    button.addEventListener('click', () => {
      const isOpen = card.classList.contains('open');
      setAccordionState(card, !isOpen);
    });
  });

  window.addEventListener('resize', () => {
    accordions.forEach((card) => {
      if (card.classList.contains('open')) {
        const body = card.querySelector('[data-accordion-body]');
        if (body) {
          body.style.maxHeight = `${body.scrollHeight}px`;
        }
      }
    });
  });

  const revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  document.addEventListener('keydown', (event) => {
    if (portalModeEnabled) {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        movePortalSection(1);
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        movePortalSection(-1);
      }
    }

    if (event.key === 'Escape') {
      closeMenuDropdowns();
      if (menuToggle && menuList && window.innerWidth <= 920) {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Abrir menu');
        menuList.classList.remove('open');
      }
    }

    if (event.key === 'Escape' && mysteryModal && mysteryModal.classList.contains('open')) {
      closeMysteryModal();
    }
  });
})();
