(() => {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuList = document.getElementById('menu-list');
  const menuDropdowns = menuList ? menuList.querySelectorAll('.menu-dropdown') : [];
  const menuCloseButtons = menuList ? menuList.querySelectorAll('[data-menu-close]') : [];
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
  const PORTAL_LEAVING_CLASS = 'is-portal-leaving';
  const PORTAL_NAV_FORWARD_CLASS = 'is-portal-nav-forward';
  const PORTAL_NAV_BACKWARD_CLASS = 'is-portal-nav-backward';
  const PORTAL_NAV_DEBOUNCE_MS = 420;
  const PORTAL_TRANSITION_MS = 420;
  const PORTAL_SCROLL_EDGE_TOLERANCE = 2;
  const COMPACT_MENU_BREAKPOINT = 920;
  const FONT_SCALE_MIN = 0.9;
  const FONT_SCALE_MAX = 1.25;
  const FONT_SCALE_STEP = 0.05;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const closeMenuDropdowns = () => {
    menuDropdowns.forEach((dropdown) => {
      dropdown.removeAttribute('open');
    });
  };

  const isCompactMenuViewport = () => window.innerWidth <= COMPACT_MENU_BREAKPOINT;

  const closeMainMenu = () => {
    if (!menuToggle || !menuList) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
    menuList.classList.remove('open');
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
  let portalSectionIndex = -1;
  let lastPortalNavigationAt = 0;
  let touchStartY = null;
  let touchStartSectionScrollTop = 0;
  let portalTransitionCleanupId = null;

  const getActivePortalSection = () => {
    if (!pageSections.length) return null;

    const activeByClass = pageSections.find((section) => section.classList.contains(PORTAL_ACTIVE_CLASS));
    if (activeByClass) return activeByClass;

    if (portalSectionIndex >= 0 && portalSectionIndex < pageSections.length) {
      return pageSections[portalSectionIndex];
    }

    return null;
  };

  const canScrollPortalSection = (section) => (
    Boolean(section) && (section.scrollHeight - section.clientHeight) > PORTAL_SCROLL_EDGE_TOLERANCE
  );

  const isPortalSectionAtTop = (section) => (
    !section || section.scrollTop <= PORTAL_SCROLL_EDGE_TOLERANCE
  );

  const isPortalSectionAtBottom = (section) => {
    if (!section) return false;
    return section.scrollTop + section.clientHeight >= section.scrollHeight - PORTAL_SCROLL_EDGE_TOLERANCE;
  };

  const setPortalActiveSection = (sectionId, options = {}) => {
    if (!pageSections.length) return;

    const { updateHash = true, behavior = 'auto', direction } = options;
    const targetIndex = getSectionIndexById(sectionId);
    if (targetIndex < 0) return;

    const previousIndex = portalSectionIndex;
    const targetSection = pageSections[targetIndex];
    const previousSection = getActivePortalSection();
    const inferredDirection = previousIndex >= 0 ? Math.sign(targetIndex - previousIndex) : 0;
    const normalizedDirection = Number.isFinite(direction)
      ? (direction > 0 ? 1 : (direction < 0 ? -1 : 0))
      : inferredDirection;
    const shouldAnimateSwitch = (
      portalModeEnabled
      && Boolean(previousSection)
      && previousSection !== targetSection
      && normalizedDirection !== 0
    );

    if (mainElement) {
      mainElement.classList.toggle(PORTAL_NAV_FORWARD_CLASS, normalizedDirection > 0);
      mainElement.classList.toggle(PORTAL_NAV_BACKWARD_CLASS, normalizedDirection < 0);
    }

    pageSections.forEach((section) => {
      section.classList.remove(PORTAL_LEAVING_CLASS);
    });

    if (portalTransitionCleanupId) {
      window.clearTimeout(portalTransitionCleanupId);
      portalTransitionCleanupId = null;
    }

    if (shouldAnimateSwitch && previousSection) {
      previousSection.classList.add(PORTAL_LEAVING_CLASS);
      portalTransitionCleanupId = window.setTimeout(() => {
        previousSection.classList.remove(PORTAL_LEAVING_CLASS);
        if (mainElement) {
          mainElement.classList.remove(PORTAL_NAV_FORWARD_CLASS, PORTAL_NAV_BACKWARD_CLASS);
        }
        portalTransitionCleanupId = null;
      }, PORTAL_TRANSITION_MS);
    } else if (mainElement) {
      mainElement.classList.remove(PORTAL_NAV_FORWARD_CLASS, PORTAL_NAV_BACKWARD_CLASS);
    }

    portalSectionIndex = targetIndex;

    pageSections.forEach((section, index) => {
      const isActive = index === targetIndex;
      section.classList.toggle(PORTAL_ACTIVE_CLASS, isActive);
      section.setAttribute('aria-hidden', String(!isActive));
      if (portalModeEnabled) {
        if (isActive) {
          section.removeAttribute('inert');
        } else {
          section.setAttribute('inert', '');
        }
      } else {
        section.removeAttribute('inert');
      }
    });

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

    setPortalActiveSection(pageSections[nextIndex].id, { updateHash: true, behavior: 'auto', direction });
  };

  if (menuToggle && menuList) {
    const hasMouseHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const shouldHandleMouseDropdown = () => hasMouseHover.matches && !isCompactMenuViewport();

    menuDropdowns.forEach((dropdown) => {
      const summary = dropdown.querySelector('summary');
      let closeDropdownTimer = null;

      const clearCloseDropdownTimer = () => {
        if (closeDropdownTimer !== null) {
          window.clearTimeout(closeDropdownTimer);
          closeDropdownTimer = null;
        }
      };

      dropdown.addEventListener('mouseenter', () => {
        if (!shouldHandleMouseDropdown()) return;
        clearCloseDropdownTimer();
        closeMenuDropdowns();
        dropdown.setAttribute('open', '');
      });

      dropdown.addEventListener('mouseleave', () => {
        if (!shouldHandleMouseDropdown()) return;
        clearCloseDropdownTimer();
        closeDropdownTimer = window.setTimeout(() => {
          dropdown.removeAttribute('open');
          closeDropdownTimer = null;
        }, 120);
      });

      if (summary) {
        summary.addEventListener('click', (event) => {
          if (!shouldHandleMouseDropdown()) return;
          event.preventDefault();
          clearCloseDropdownTimer();
          const shouldOpen = !dropdown.hasAttribute('open');
          closeMenuDropdowns();
          if (shouldOpen) {
            dropdown.setAttribute('open', '');
          }
        });
      }
    });

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

    if (menuCloseButtons.length) {
      menuCloseButtons.forEach((button) => {
        button.addEventListener('click', () => {
          closeMenuDropdowns();
          closeMainMenu();
        });
      });
    }

    menuList.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeMenuDropdowns();
        if (isCompactMenuViewport()) {
          closeMainMenu();
        }
      });
    });

    document.addEventListener('click', (event) => {
      const isInsideMenu = menuList.contains(event.target) || menuToggle.contains(event.target);
      if (!isInsideMenu) {
        closeMenuDropdowns();
        if (isCompactMenuViewport()) {
          closeMainMenu();
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

  const portalModeEnabled = PORTAL_MODE_ENABLED && !isCompactMenuViewport();
  document.body.classList.toggle('portal-mode', portalModeEnabled);
  const isLandscapeMobileViewport = () => document.body.classList.contains('landscape-mobile');
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
      if (isLandscapeMobileViewport()) return;
      if (Math.abs(event.deltaY) < 8) return;

      const activeSection = getActivePortalSection();
      if (!activeSection) return;

      const direction = event.deltaY > 0 ? 1 : -1;
      const hasInternalScroll = canScrollPortalSection(activeSection);

      if (hasInternalScroll) {
        const shouldMoveNext = direction > 0 && isPortalSectionAtBottom(activeSection);
        const shouldMovePrevious = direction < 0 && isPortalSectionAtTop(activeSection);
        if (!shouldMoveNext && !shouldMovePrevious) return;
      }

      event.preventDefault();
      movePortalSection(direction);
    }, { passive: false });

    mainElement.addEventListener('touchstart', (event) => {
      if (!portalModeEnabled) return;
      if (isLandscapeMobileViewport()) {
        touchStartY = null;
        touchStartSectionScrollTop = 0;
        return;
      }
      touchStartY = event.touches[0]?.clientY ?? null;
      const activeSection = getActivePortalSection();
      touchStartSectionScrollTop = activeSection ? activeSection.scrollTop : 0;
    }, { passive: true });

    mainElement.addEventListener('touchend', (event) => {
      if (isLandscapeMobileViewport()) {
        touchStartY = null;
        touchStartSectionScrollTop = 0;
        return;
      }
      if (!portalModeEnabled || touchStartY === null) return;
      const touchEndY = event.changedTouches[0]?.clientY ?? touchStartY;
      const deltaY = touchStartY - touchEndY;
      const startScrollTop = touchStartSectionScrollTop;
      touchStartY = null;
      touchStartSectionScrollTop = 0;
      if (Math.abs(deltaY) < 36) return;

      const direction = deltaY > 0 ? 1 : -1;
      const activeSection = getActivePortalSection();
      if (!activeSection || !canScrollPortalSection(activeSection)) {
        movePortalSection(direction);
        return;
      }

      if (direction > 0) {
        const startedAtBottom = startScrollTop + activeSection.clientHeight >= (
          activeSection.scrollHeight - PORTAL_SCROLL_EDGE_TOLERANCE
        );
        if (startedAtBottom && isPortalSectionAtBottom(activeSection)) {
          movePortalSection(1);
        }
        return;
      }

      const startedAtTop = startScrollTop <= PORTAL_SCROLL_EDGE_TOLERANCE;
      if (startedAtTop && isPortalSectionAtTop(activeSection)) {
        movePortalSection(-1);
      }
    }, { passive: true });
  }
  window.addEventListener('scroll', scheduleSectionSync, { passive: true });

  let wasLandscapeMobile = null;

  const attemptHideMobileBrowserBars = () => {
    if (!document.body.classList.contains('landscape-mobile')) return;
    const tryNudge = () => {
      window.scrollTo(0, 1);
    };

    tryNudge();
    window.setTimeout(tryNudge, 120);
    window.setTimeout(tryNudge, 280);
  };

  const applyMobileLandscapeViewport = (source = 'resize') => {
    syncHeaderHeight();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const vh = viewportHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    const isLandscapeMobile = window.matchMedia('(max-width: 920px) and (orientation: landscape)').matches;
    document.body.classList.toggle('landscape-mobile', isLandscapeMobile);

    // Avoid forced scroll on every resize: it causes jump-to-top while the user scrolls.
    const justEnteredLandscape = isLandscapeMobile && wasLandscapeMobile !== true;
    const canAttemptHideBars = source === 'load' || source === 'orientationchange';

    if (justEnteredLandscape && canAttemptHideBars) {
      window.setTimeout(attemptHideMobileBrowserBars, 80);
    }

    wasLandscapeMobile = isLandscapeMobile;
  };

  applyMobileLandscapeViewport('load');
  window.addEventListener('resize', () => applyMobileLandscapeViewport('resize'));
  window.addEventListener('orientationchange', () => applyMobileLandscapeViewport('orientationchange'));
  window.addEventListener('load', () => applyMobileLandscapeViewport('load'));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => applyMobileLandscapeViewport('resize'));
  }
  window.addEventListener('touchstart', () => {
    if (!document.body.classList.contains('landscape-mobile')) return;
    attemptHideMobileBrowserBars();
  }, { passive: true });

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
      title: 'Mistérios Gloriosos',
      items: [
        'Ressurreição de Jesus',
        'Ascensão de Jesus ao Céu',
        'Descida do Espírito Santo sobre Nossa Senhora e os Apóstolos, reunidos no Cenáculo, em oração',
        'Assunção de Maria ao Céu em corpo e alma',
        'Coroação de Nossa Senhora como Rainha do Céu e da Terra'
      ]
    },
    1: {
      day: 'Segunda-feira',
      title: 'Mistérios Gozosos',
      items: [
        'Anunciação do Anjo a Nossa Senhora',
        'Visita de Nossa Senhora à sua prima Santa Isabel',
        'Nascimento de Jesus na gruta de Belém',
        'Apresentação do Menino Jesus no Templo',
        'Perda e encontro do Menino Jesus no Templo'
      ]
    },
    2: {
      day: 'Terca-feira',
      title: 'Mistérios Dolorosos',
      items: [
        'Agonia de Jesus no Horto das Oliveiras',
        'Flagelação de Jesus',
        'Jesus é coroado de espinhos',
        'Jesus sobe o Monte Calvário com a cruz às costas',
        'Crucificação e morte de Jesus'
      ]
    },
    3: {
      day: 'Quarta-feira',
      title: 'Mistérios Gloriosos',
      items: [
        'Ressurreição de Jesus',
        'Ascensão de Jesus ao Céu',
        'Descida do Espírito Santo sobre Nossa Senhora e os Apóstolos, reunidos no Cenáculo, em oração',
        'Assunção de Maria ao Céu em corpo e alma',
        'Coroação de Nossa Senhora como Rainha do Céu e da Terra'
      ]
    },
    4: {
      day: 'Quinta-feira',
      title: 'Mistérios Luminosos',
      items: [
        'Batismo de Jesus nas águas do rio Jordão',
        'Jesus revela-Se nas Bodas de Caná',
        'Jesus anuncia o Reino de Deus com o convite à conversão',
        'A Transfiguração de Jesus',
        'A instituição da Eucaristia'
      ]
    },
    5: {
      day: 'Sexta-feira',
      title: 'Mistérios Dolorosos',
      items: [
        'Agonia de Jesus no Horto das Oliveiras',
        'Flagelação de Jesus',
        'Jesus é coroado de espinhos',
        'Jesus sobe o Monte Calvário com a cruz às costas',
        'Crucificação e morte de Jesus'
      ]
    },
    6: {
      day: 'Sabado',
      title: 'Mistérios Gozosos',
      items: [
        'Anunciação do Anjo a Nossa Senhora',
        'Visita de Nossa Senhora à sua prima Santa Isabel',
        'Nascimento de Jesus na gruta de Belém',
        'Apresentação do Menino Jesus no Templo',
        'Perda e encontro do Menino Jesus no Templo'
      ]
    }
  };

  const mysteryMeditations = {
    "Anunciação do Anjo a Nossa Senhora": "Mãe, as palavras do Anjo perturbaram-Te. Não duvidaste, mas ficaste confusa... Deus olhou para a tua pequenez. Faz-nos entender o valor dos pequenos \"sim\" que Deus espera de nós, dia a dia, e dá-nos a graça de aceitar com confiança os Seus planos, mesmo sendo diferentes dos nossos.",
    "Visita de Nossa Senhora à sua prima Santa Isabel": "Mãe, caminhas até à casa de Isabel, a quem vais servir. Comunicas alegria e graça, porque levas Jesus dentro de Ti. Dá-nos, também a nós, a consciência de sermos teus instrumentos, mensageiros de Jesus, caminhando ao encontro da vida.",
    "Nascimento de Jesus na gruta de Belém": "Mãe, no pobre e pequeno estábulo de Belém, dás à luz o Senhor do mundo, pois não havia para Ele lugar na hospedaria. Também no mundo de hoje, Deus não tem lugar na vida dos homens. Por isso, Mãe, transforma os nossos corações, para que aprendamos a criar espaço para Jesus e, assim, Ele possa nascer em nós, cada dia.",
    "Apresentação do Menino Jesus no Templo": "Mãe, no Templo ofereces, sem reservas, o teu Filho ao Pai e com Ele renovas também a tua entrega. Ajuda-nos para que, como Tu, também nós sejamos capazes de oferecer hoje a Deus tudo o que nos preocupa, renovando o nosso \"sim\" a tudo o que são os planos d'Ele para nós.",
    "Perda e encontro do Menino Jesus no Templo": "Mãe, muitas vezes Deus põe-Te à prova e assim prepara o teu coração para sacrifícios maiores. Ele trata-Te duramente, para que um dia possas permanecer de pé junto à cruz do teu Filho. Ajuda-nos, querida Mãe, a também permanecermos serenos quando Deus nos manda duras provas de fé. Pedimos-Te que nos ensines o caminho de volta ao coração do Pai, sempre que nos encontrarmos perdidos na confusão do mundo ou na intranquilidade do nosso coração.",
    "Batismo de Jesus nas águas do rio Jordão": "Mãe, o teu Filho, na sua humildade, quis ser como um de nós, homens, recebendo o Batismo. Fez-nos assim entender que, ao tornarmo-nos filhos de Deus e seus irmãos, a nossa missão pessoal ficou intimamente ligada à sua. Que a consciência desta dignidade nos leve a caminhar na vida como teu Filho Jesus, seguros na força do Espírito Santo que recebemos pelo Batismo e abertos aos planos de Deus.",
    "Jesus revela-Se nas Bodas de Caná": "Mãe, em Caná revelaste-nos que estás atenta às pessoas, que vês o que falta nas nossas vidas e que entregas a teu Filho as situações que precisam de uma solução: \"Eles não têm mais vinho\". Cheia de confiança dirigiste-Te aos serventes dizendo: \"Fazei o que Ele vos disser\". Muitas vezes, na nossa vida, o amor também se esvazia, \"falta o vinho\". Ajuda-nos, Mãe, nesses momentos, a confiar como Tu em Jesus, a fazer as pequenas coisas que Ele nos diz, para que, apesar da nossa pequenez, Ele possa abrir os nossos corações para o verdadeiro amor.",
    "Jesus anuncia o Reino de Deus com o convite à conversão": "Mãe, certamente te sentiste inquieta com teu Filho quando começou a anunciar a Boa Nova; certamente quiseste estar a seu lado; também, com certeza, sentiste arder em Ti a esperança de um mundo novo. Na sua pregação, Jesus lançou os fundamentos de um mundo novo, onde reinam o amor, a partilha, o perdão, a fraternidade. Contigo, Mãe, queremos aprender a esperança nas suas palavras.",
    "A Transfiguração de Jesus": "Mãe, estiveste sempre tão perto de Jesus! Mãe de Deus! Tu sabias que a transfiguração significava uma palavra de ânimo para os apóstolos; aí se manifestou a glória de Jesus e se confirmou que Ele é, apesar da cruz que se aproxima, o Filho amado de Deus. Que esta certeza faça crescer em nós o entusiasmo por viver como verdadeiros cristãos, assumindo com tranquilidade e alegria a nossa cruz como caminho para a Ressurreição.",
    "A instituição da Eucaristia": "Mãe, encontraste-Te com teu Filho muito antes de nós! Muito antes Te apercebeste do seu grande amor. Jesus quis que cada um de nós também se encontrasse com Ele na Eucaristia: a comunhão é o momento do encontro máximo de dois amores, e nessa oferta está também cada um de nós, entregando-se por inteiro, com tudo o que faz parte da sua vida, em favor de todos os homens. Querida Mãe, sabes que temos um caminho interior a percorrer, para que a comunhão aconteça em nós. Ensina-nos a dar esses passos, de coração aberto; estamos seguros de que Tu nos levarás ao verdadeiro encontro com Jesus.",
    "Agonia de Jesus no Horto das Oliveiras": "Mãe, a angústia pelo sofrimento faz o teu Filho sofrer. Mas nada O retém na Sua entrega e espírito de sacrifício pelo Pai e por nós. Faz que, também nós, saibamos alimentar-nos da oração e oferecer com amor todos os nossos sofrimentos e assim colaborar com Jesus na salvação do mundo.",
    "Flagelação de Jesus": "Mãe, a cada chicotada, teu Filho sofre em silêncio por amor a nós. Que todos nós, \"tocados\" pelo olhar de Jesus, procuremos afastar da nossa vida tudo o que não é digno do seu amor.",
    "Jesus é coroado de espinhos": "Jesus é coroado de espinhos, é gozado como rei dos judeus, é gozado na sua missão. Não há compaixão. Ajuda-nos, Mãe, a corrigir a nossa tendência à rebeldia contra tudo o que não nos agrada e a querermos representar mais do que somos. Faz-nos entender que somente chegaremos à verdadeira grandeza, se soubermos levar com dignidade a coroa de espinhos que a vida nos impõe.",
    "Jesus sobe o Monte Calvário com a cruz às costas": "Mãe, com amor imenso, o teu Filho leva a pesada cruz que nós, por nossa fuga ao sofrimento, Lhe colocamos sobre os ombros. Acompanhando-O, ajudaste-O espiritualmente a levar a cruz. Dá-nos a tua mão e ensina-nos, Mãe, a perdoar quem nos ofende, a abrir os nossos braços e o nosso coração e a sermos capazes de ter gestos corajosos de paz e perdão.",
    "Crucificação e morte de Jesus": "Mãe, antes de morrer, Jesus entregou-Te ao discípulo amado no qual viu toda a humanidade: \"Eis aí o teu filho\". A S. João (como se a todos nós) disse: \"Eis aí a tua Mãe\". Jesus deixou-Te como nossa Mãe e a Ti pedimos que nos ajudes a entender o sentido do sofrimento e a aceitar com amor as nossas cruzes e dores para as oferecer alegremente a Deus.",
    "Ressurreição de Jesus": "Jesus está vivo, Mãe! Apareceu aos discípulos de Emaús, a Maria Madalena e ficará presente para sempre. Ele venceu a morte e o pecado. Ajuda-nos a descobrir este Cristo vivo na nossa vida, em cada pessoa e em tudo à nossa volta e dá-nos as graças de que necessitamos para resistir ao mal, nos levantarmos sempre de novo do erro e do desânimo e sermos capazes de recomeçar todos os dias.",
    "Ascensão de Jesus ao Céu": "Mãe, contemplas a subida do teu Filho ao Céu, o seu regresso ao Pai. A sua felicidade é também a tua. Ajuda-nos a manter sempre viva a ligação ao coração de Jesus, porque Ele é o caminho para o Pai. Contigo queremos transformar a nossa vida no projeto que Deus pensou para nós.",
    "Descida do Espírito Santo sobre Nossa Senhora e os Apóstolos, reunidos no Cenáculo, em oração": "Mãe, na tua presença os apóstolos recebem uma missão que os ultrapassa: o Espírito Santo transforma-os em homens corajosos, fiéis anunciadores do Evangelho. Dispõe também as nossas almas à atuação do Espírito de Deus. Que Ele nos queime com o fogo do seu amor, nos transforme e nos ajude a anunciarmos o Evangelho pela palavra e pelo testemunho da nossa vida.",
    "Assunção de Maria ao Céu em corpo e alma": "Mãe, como viveste com o teu Filho, com Ele amaste e sofreste, assim, ao terminar a tua existência, Ele Te leva, em corpo e alma, para o Céu. Quando nos consagramos a Ti, querida Mãe, estamos a partilhar do amor de Jesus que Te quis perto d'Ele para sempre. Faz-nos viver fielmente essa entrega e confiança nas coisas pequenas de cada dia.",
    "Coroação de Nossa Senhora como Rainha do Céu e da Terra": "Mãe, reinas no Céu e reinas no mundo, podendo assim distribuir as graças do Céu. Hoje queremos coroar-Te como Rainha do nosso coração, queremos entregar-Te o poder sobre a nossa vida e pomos nas tuas mãos as nossas inquietações. Educa-nos, fortalece-nos nas dificuldades e guia-nos rumo ao Céu."
  };

  const mysteryModal = document.getElementById('mystery-modal');
  const mysteryModalLinks = document.getElementById('mystery-modal-links');
  const mysteryModalTitle = document.getElementById('mystery-modal-title');
  const mysteryModalText = document.getElementById('mystery-modal-text');
  const mysteryModalGroup = document.getElementById('mystery-modal-group');
  const mysteryJaculatoryToggle = document.getElementById('mystery-jaculatory-toggle');
  const mysteryJaculatoryPanel = document.getElementById('mystery-jaculatory-panel');
  const mysteryModalCloseButtons = document.querySelectorAll('[data-mystery-modal-close]');
  let lastFocusedMystery = null;

  const mysteryItemsByGroup = Object.values(mysteryByDay).reduce((acc, slot) => {
    if (!acc[slot.title]) {
      acc[slot.title] = slot.items.slice();
    }
    return acc;
  }, {});

  const resolveMysteryGroupTitle = (group) => {
    const rawGroup = (group || '').trim();
    if (!rawGroup) return 'Mistério do Terço';
    if (mysteryItemsByGroup[rawGroup]) return rawGroup;

    const normalized = rawGroup
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('gozoso')) return 'Mistérios Gozosos';
    if (normalized.includes('doloroso')) return 'Mistérios Dolorosos';
    if (normalized.includes('glorioso')) return 'Mistérios Gloriosos';
    if (normalized.includes('luminoso')) return 'Mistérios Luminosos';
    return rawGroup;
  };

  const renderMysteryModalLinks = (groupTitle, activeTitle) => {
    if (!mysteryModalLinks) return;

    const items = mysteryItemsByGroup[groupTitle] || [];
    mysteryModalLinks.innerHTML = '';
    mysteryModalLinks.hidden = items.length === 0;
    if (!items.length) return;

    items.forEach((itemTitle, index) => {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'mystery-modal-link';
      link.textContent = `${index + 1}º Mistério`;
      link.dataset.shortLabel = String(index + 1);
      link.title = itemTitle;
      link.setAttribute('aria-label', `${index + 1}º Mistério: ${itemTitle}`);

      if (itemTitle === activeTitle) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'true');
      }

      link.addEventListener('click', (event) => {
        event.preventDefault();
        openMysteryModal(itemTitle, groupTitle);
      });

      mysteryModalLinks.appendChild(link);
    });
  };

  const syncBodyModalLock = () => {
    const hasAnyOpenModal = Boolean(document.querySelector('.mystery-modal.open, .song-modal.open'));
    document.body.classList.toggle('has-modal-open', hasAnyOpenModal);
  };

  const setMysteryJaculatoryVisible = (visible) => {
    if (!mysteryJaculatoryToggle || !mysteryJaculatoryPanel) return;

    mysteryJaculatoryPanel.hidden = !visible;
    mysteryJaculatoryToggle.classList.toggle('is-active', visible);
    mysteryJaculatoryToggle.setAttribute('aria-expanded', String(visible));
    mysteryJaculatoryToggle.textContent = visible ? 'Ocultar jaculatoria' : 'Exibir jaculatoria';
  };

  const openMysteryModal = (title, group) => {
    if (!mysteryModal || !mysteryModalTitle || !mysteryModalText || !mysteryModalGroup) return;

    const shouldResetJaculatory = !mysteryModal.classList.contains('open');
    const resolvedGroup = resolveMysteryGroupTitle(group);
    const meditation = mysteryMeditations[title] || 'Meditacao em preparacao. Em breve o texto completo deste misterio estara disponivel.';
    mysteryModalTitle.textContent = title;
    mysteryModalText.textContent = meditation;
    mysteryModalGroup.textContent = resolvedGroup;
    renderMysteryModalLinks(resolvedGroup, title);
    if (shouldResetJaculatory) {
      setMysteryJaculatoryVisible(false);
    }
    mysteryModal.classList.add('open');
    mysteryModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
  };

  const closeMysteryModal = () => {
    if (!mysteryModal) return;
    mysteryModal.classList.remove('open');
    mysteryModal.setAttribute('aria-hidden', 'true');
    setMysteryJaculatoryVisible(false);
    syncBodyModalLock();
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

  if (mysteryJaculatoryToggle) {
    mysteryJaculatoryToggle.addEventListener('click', () => {
      setMysteryJaculatoryVisible(Boolean(mysteryJaculatoryPanel?.hidden));
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

  const songFetchForm = document.getElementById('song-fetch-form');
  const songSearchQueryInput = document.getElementById('song-search-query');
  const songSearchTriggerBtn = document.getElementById('song-search-trigger');
  const songSearchClearBtn = document.getElementById('song-search-clear');
  const songFetchFormCantos = document.getElementById('song-fetch-form-cantos');
  const songSearchQueryInputCantos = document.getElementById('song-search-query-cantos');
  const songSearchTriggerBtnCantos = document.getElementById('song-search-trigger-cantos');
  const songSearchClearBtnCantos = document.getElementById('song-search-clear-cantos');
  const songFetchSubmit = document.getElementById('song-fetch-submit');
  const songFetchFeedback = document.getElementById('song-fetch-feedback');
  const songFetchFeedbackCantos = document.getElementById('song-fetch-feedback-cantos');
  const songSearchResults = document.getElementById('song-search-results');
  const songSearchResultsList = document.getElementById('song-search-results-list');
  const songSearchResultsCantos = document.getElementById('song-search-results-cantos');
  const songSearchResultsListCantos = document.getElementById('song-search-results-list-cantos');
  const songToast = document.getElementById('song-toast');
  const songModal = document.getElementById('song-modal');
  const songModalDialog = songModal ? songModal.querySelector('.song-modal-dialog') : null;
  const songModalCloseButtons = document.querySelectorAll('[data-song-modal-close]');
  const fetchedSongCard = document.getElementById('fetched-song-card');
  const fetchedSongTitle = document.getElementById('fetched-song-title');
  const fetchedSongMeta = document.getElementById('fetched-song-meta');
  const fetchedSongLyrics = document.getElementById('fetched-song-lyrics');
  const songModalToneRow = songModal ? songModal.querySelector('.song-modal-tone-row') : null;
  const songModalToneLabel = songModal ? songModal.querySelector('.song-modal-tone-label') : null;
  const songToneResetBtn = document.getElementById('song-tone-reset');
  const songToneGrid = document.getElementById('song-tone-grid');
  let lastFocusedSongTrigger = null;
  const songSearchWidgets = [
    {
      id: 'header',
      form: songFetchForm,
      input: songSearchQueryInput,
      searchBtn: songSearchTriggerBtn,
      clearBtn: songSearchClearBtn,
      feedback: songFetchFeedback,
      resultsContainer: songSearchResults,
      resultsList: songSearchResultsList
    },
    {
      id: 'cantos',
      form: songFetchFormCantos,
      input: songSearchQueryInputCantos,
      searchBtn: songSearchTriggerBtnCantos,
      clearBtn: songSearchClearBtnCantos,
      feedback: songFetchFeedbackCantos,
      resultsContainer: songSearchResultsCantos,
      resultsList: songSearchResultsListCantos
    }
  ].filter((widget) => (
    widget.input
    && widget.clearBtn
    && widget.feedback
    && widget.resultsContainer
    && widget.resultsList
  ));

  const resolveSongSearchWidget = (preferredWidget = null) => {
    if (!songSearchWidgets.length) return null;

    const activeSectionId = getActivePortalSection()?.id || '';
    if (activeSectionId === 'cantos') {
      const cantosWidget = songSearchWidgets.find((widget) => widget.id === 'cantos');
      if (cantosWidget) return cantosWidget;
    }

    if (preferredWidget && songSearchWidgets.includes(preferredWidget)) {
      return preferredWidget;
    }

    return songSearchWidgets[0];
  };

  const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const TONE_BUTTON_ORDER = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];
  const NOTE_INDEX_MAP = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11
  };

  const songState = {
    loaded: false,
    title: '',
    artist: '',
    source: '',
    sourceLabel: '',
    sourceUrl: '',
    originalKey: '',
    originalRoot: null,
    originalSuffix: '',
    semitones: 0,
    originalContent: '',
    contentType: 'chords'
  };

  const canonicalNote = (rawNote) => {
    const note = (rawNote || '').trim();
    if (!note) return null;

    const first = note.charAt(0).toUpperCase();
    const accidental = note.charAt(1);
    const normalized = accidental === '#' || accidental === 'b' ? `${first}${accidental}` : first;
    return Object.prototype.hasOwnProperty.call(NOTE_INDEX_MAP, normalized) ? normalized : null;
  };

  const splitKey = (rawKey) => {
    const cleaned = (rawKey || '').trim();
    if (!cleaned) return null;
    const match = cleaned.match(/^([A-G](?:#|b)?)(.*)$/i);
    if (!match) return null;
    const root = canonicalNote(match[1]);
    if (!root) return null;
    return {
      root,
      suffix: match[2] || ''
    };
  };

  const transposeRoot = (root, semitones, preferFlat) => {
    const index = NOTE_INDEX_MAP[root];
    if (!Number.isInteger(index)) return root;
    const nextIndex = (index + semitones + 1200) % 12;
    const scale = preferFlat ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
    return scale[nextIndex];
  };

  const transposeChordSymbol = (symbol, semitones, preferFlatDefault) => {
    if (!semitones) return symbol;

    return symbol
      .split('/')
      .map((part) => {
        const match = part.match(/^([A-G](?:#|b)?)(.*)$/i);
        if (!match) return part;
        const root = canonicalNote(match[1]);
        if (!root) return part;
        const rest = match[2] || '';
        const preferFlat = match[1].includes('b') || (preferFlatDefault && !match[1].includes('#'));
        const transposedRoot = transposeRoot(root, semitones, preferFlat);
        return `${transposedRoot}${rest}`;
      })
      .join('/');
  };

  const transposeBracketedChords = (text, semitones, preferFlatDefault) => {
    if (!text || !semitones) return text;
    return text.replace(/\[([^\]\n]+)\]/g, (full, chord) => {
      const transposed = transposeChordSymbol(chord, semitones, preferFlatDefault);
      return `[${transposed}]`;
    });
  };

  const setSongFeedback = (message, type = '', targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    const targetWidgets = targetWidget ? [targetWidget] : songSearchWidgets;
    targetWidgets.forEach((widget) => {
      widget.feedback.textContent = message || '';
      widget.feedback.classList.remove('is-error', 'is-success', 'is-loading');
      if (type) {
        widget.feedback.classList.add(type);
      }
    });
  };

  const setFetchSubmitState = (loading, label) => {
    if (!songFetchSubmit) return;
    songFetchSubmit.disabled = loading;
    songFetchSubmit.textContent = label;
  };

  const clearSongSearchResults = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    const targetWidgets = targetWidget ? [targetWidget] : songSearchWidgets;
    targetWidgets.forEach((widget) => {
      widget.resultsList.innerHTML = '';
      widget.resultsContainer.hidden = true;
    });
  };

  let songToastTimerId = null;

  const showSongToast = (message, type = '') => {
    if (!songToast) return;
    songToast.textContent = message || '';
    songToast.classList.remove('is-warning', 'is-visible');
    if (type) {
      songToast.classList.add(type);
    }
    songToast.hidden = false;
    window.requestAnimationFrame(() => {
      songToast.classList.add('is-visible');
    });

    if (songToastTimerId) {
      window.clearTimeout(songToastTimerId);
    }
    songToastTimerId = window.setTimeout(() => {
      songToast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (!songToast.classList.contains('is-visible')) {
          songToast.hidden = true;
        }
      }, 220);
    }, 3600);
  };

  const hideSongSearchResultsExcept = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    songSearchWidgets.forEach((widget) => {
      if (targetWidget && widget === targetWidget) return;
      widget.resultsContainer.hidden = true;
    });
  };

  const resetSongModalScroll = () => {
    if (songModalDialog) {
      songModalDialog.scrollTop = 0;
    }
    if (fetchedSongLyrics) {
      fetchedSongLyrics.scrollTop = 0;
    }
  };

  const openSongModal = (triggerElement = null) => {
    if (!songModal) return;
    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedSongTrigger = triggerElement || fallbackFocus;
    songModal.classList.add('open');
    songModal.setAttribute('aria-hidden', 'false');
    resetSongModalScroll();
    window.requestAnimationFrame(() => {
      resetSongModalScroll();
    });
    syncBodyModalLock();
  };

  const closeSongModal = () => {
    if (!songModal) return;
    songModal.classList.remove('open');
    songModal.setAttribute('aria-hidden', 'true');
    syncBodyModalLock();
    if (lastFocusedSongTrigger) {
      lastFocusedSongTrigger.focus();
      lastFocusedSongTrigger = null;
    }
  };

  if (songModalCloseButtons.length) {
    songModalCloseButtons.forEach((button) => {
      button.addEventListener('click', closeSongModal);
    });
  }

  const syncSongSearchClearButtons = () => {
    if (!songSearchWidgets.length) return;
    songSearchWidgets.forEach((widget) => {
      const hasValue = Boolean(widget.input.value.trim());
      widget.clearBtn.hidden = !hasValue;
      widget.clearBtn.disabled = !hasValue;
      if (widget.searchBtn) {
        widget.searchBtn.disabled = !hasValue;
      }
    });
  };

  const syncSongSearchInputs = (sourceInput) => {
    if (!songSearchWidgets.length || !sourceInput) return;
    const sourceValue = sourceInput.value;
    songSearchWidgets.forEach((widget) => {
      if (widget.input === sourceInput) return;
      widget.input.value = sourceValue;
    });
  };

  const currentKeyLabel = () => {
    if (!songState.originalRoot) return 'Nao informado';
    const preferFlat = songState.originalRoot.includes('b');
    const currentRoot = transposeRoot(songState.originalRoot, songState.semitones, preferFlat);
    return `${currentRoot}${songState.originalSuffix || ''}`;
  };

  const updateToneButtonsState = () => {
    const isLyricsMode = songState.contentType === 'lyrics';
    if (songModal) {
      songModal.classList.toggle('is-lyrics-mode', isLyricsMode);
    }

    const toneButtons = songToneGrid ? songToneGrid.querySelectorAll('button[data-tone]') : [];
    const hasRoot = Boolean(songState.loaded && songState.contentType === 'chords' && songState.originalRoot);
    const activeKey = currentKeyLabel();
    const activeRoot = splitKey(activeKey)?.root;

    toneButtons.forEach((button) => {
      const tone = button.dataset.tone || '';
      const normalizedTone = canonicalNote(tone);
      const active = hasRoot && activeRoot && normalizedTone === activeRoot;
      button.classList.toggle('is-active', Boolean(active));
      button.disabled = !hasRoot;
    });

    if (songToneResetBtn) {
      songToneResetBtn.disabled = !hasRoot || songState.semitones === 0;
    }

    if (songModalToneRow) {
      songModalToneRow.classList.toggle('is-disabled', !hasRoot);
    }
    if (songModalToneLabel) {
      songModalToneLabel.textContent = 'Tom:';
    }
  };

  const renderFetchedSong = () => {
    if (!songState.loaded) return;

    const displayTitle = songState.artist
      ? `${songState.title || 'Musica'} - ${songState.artist}`
      : (songState.title || 'Musica carregada');

    if (fetchedSongTitle) {
      fetchedSongTitle.textContent = displayTitle;
    }

    if (fetchedSongMeta) {
      const sourceLabel = songState.sourceLabel || 'Portal';
      if (songState.contentType === 'lyrics') {
        fetchedSongMeta.textContent = `Fonte: ${sourceLabel}`;
      } else {
        const original = songState.originalKey || 'Nao informado';
        fetchedSongMeta.textContent = `Tom original: ${original} | Fonte: ${sourceLabel}`;
      }
    }

    const canTranspose = Boolean(songState.contentType === 'chords' && songState.originalRoot);
    const preferFlat = canTranspose && songState.originalRoot ? songState.originalRoot.includes('b') : false;
    const visibleContent = canTranspose
      ? transposeBracketedChords(songState.originalContent, songState.semitones, preferFlat)
      : (songState.originalContent || '');
    if (fetchedSongLyrics) {
      fetchedSongLyrics.textContent = visibleContent;
      fetchedSongLyrics.scrollTop = 0;
    }

    updateToneButtonsState();
  };

  const setSongActionLoading = (button, loading, fallbackLabel) => {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.textContent || fallbackLabel;
      button.disabled = true;
      button.textContent = 'Carregando...';
      return;
    }

    button.disabled = false;
    button.textContent = button.dataset.originalLabel || fallbackLabel;
    delete button.dataset.originalLabel;
  };

  async function loadSongFromUrl(url, triggerButton = null, selectedResult = null) {
    const safeUrl = (url || '').trim();
    if (!safeUrl) {
      setSongFeedback('A opcao selecionada nao possui um link valido de cifra.', 'is-error');
      return;
    }

    setSongActionLoading(triggerButton, true, 'Cifra');
    setSongFeedback('Carregando cifra selecionada...', 'is-loading');

    try {
      const response = await fetch('/api/songs/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: safeUrl })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || 'Nao foi possivel carregar a cifra.';
        throw new Error(message);
      }

      const selectedTitle = (selectedResult?.title || '').trim();
      const selectedArtist = (selectedResult?.artist || '').trim();
      const keyParts = splitKey(payload.original_key || '');
      songState.loaded = true;
      songState.title = selectedTitle || payload.title || 'Musica';
      songState.artist = selectedArtist || payload.artist || '';
      songState.source = payload.source || '';
      songState.sourceLabel = payload.source_label || (payload.source === 'cifraclub' ? 'Cifra Club' : 'Cifras');
      songState.sourceUrl = payload.url || safeUrl;
      songState.originalKey = payload.original_key || '';
      songState.originalRoot = keyParts ? keyParts.root : null;
      songState.originalSuffix = keyParts ? keyParts.suffix : '';
      songState.semitones = 0;
      songState.originalContent = payload.lyrics || '';
      songState.contentType = 'chords';

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      setSongFeedback('Cifra carregada. Ajuste o tom abaixo do titulo.', 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar a cifra.';
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, 'Cifra');
    }
  }

  async function loadLyricsFromService(result, triggerButton = null) {
    const title = (result?.title || '').trim();
    const artist = (result?.artist || '').trim();
    const sourceUrl = (result?.url || '').trim();

    if (!title && !sourceUrl) {
      setSongFeedback('Nao foi possivel identificar a musica para buscar a letra.', 'is-error');
      return;
    }

    setSongActionLoading(triggerButton, true, 'Letra');
    setSongFeedback('Buscando letra no Letras.mus.br...', 'is-loading');

    try {
      const response = await fetch('/api/songs/fetch-lyrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          artist,
          source_url: sourceUrl
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || 'Nao foi possivel carregar a letra.';
        const code = payload?.detail?.code || payload?.code || '';
        const error = new Error(message);
        if (code) {
          error.code = code;
        }
        throw error;
      }

      songState.loaded = true;
      songState.title = title || payload.title || 'Musica';
      songState.artist = artist || payload.artist || '';
      songState.source = payload.source || 'letras';
      songState.sourceLabel = payload.source_label || 'Letras.mus.br';
      songState.sourceUrl = payload.url || sourceUrl;
      songState.originalKey = '';
      songState.originalRoot = null;
      songState.originalSuffix = '';
      songState.semitones = 0;
      songState.originalContent = payload.lyrics || '';
      songState.contentType = 'lyrics';

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      setSongFeedback('Letra carregada com sucesso.', 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar a letra.';
      const isLyricsNotFound = (
        err
        && typeof err === 'object'
        && 'code' in err
        && err.code === 'lyrics_not_found'
      ) || message === 'Nao foi possivel carregar a letra no Letras.mus.br para esta musica.';

      if (isLyricsNotFound) {
        showSongToast('Nao encontramos a letra no Letras.mus.br para esta musica.', 'is-warning');
      }
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, 'Letra');
    }
  }

  const buildExternalSongSearchQuery = (result) => {
    const title = (result?.title || '').trim();
    const artist = (result?.artist || '').trim();
    return [title, artist].filter(Boolean).join(' ');
  };

  const buildExternalSongSearchUrl = (platform, query) => {
    const safeQuery = (query || '').trim();
    if (!safeQuery) {
      return '';
    }

    const encodedQuery = encodeURIComponent(safeQuery);
    return platform === 'spotify'
      ? `https://open.spotify.com/search/${encodedQuery}`
      : `https://www.youtube.com/results?search_query=${encodedQuery}`;
  };

  const SPOTIFY_ACTION_ICON = [
    '<svg class="song-search-action-icon song-search-action-icon-spotify" viewBox="0 0 24 24" aria-hidden="true">',
    '<circle cx="12" cy="12" r="10" fill="#1DB954"></circle>',
    '<path d="M7.2 10.3c3.5-1 7.1-.7 10 1" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M7.9 13.1c2.8-.7 5.6-.5 8 .8" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M8.8 15.7c2-.5 4.1-.3 5.8.5" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path>',
    '</svg>'
  ].join('');

  const YOUTUBE_ACTION_ICON = [
    '<svg class="song-search-action-icon song-search-action-icon-youtube" viewBox="0 0 24 24" aria-hidden="true">',
    '<path fill="#FF0000" d="M23.498 6.186a2.974 2.974 0 00-2.093-2.105C19.55 3.5 12 3.5 12 3.5s-7.55 0-9.405.581A2.974 2.974 0 00.502 6.186 31.17 31.17 0 000 12a31.17 31.17 0 00.502 5.814 2.974 2.974 0 002.093 2.105C4.45 20.5 12 20.5 12 20.5s7.55 0 9.405-.581a2.974 2.974 0 002.093-2.105A31.17 31.17 0 0024 12a31.17 31.17 0 00-.502-5.814z"></path>',
    '<path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12 9.545 15.568z"></path>',
    '</svg>'
  ].join('');

  const renderSongSearchResults = (results, targetWidget = null) => {
    if (!songSearchWidgets.length) return;

    const activeWidget = resolveSongSearchWidget(targetWidget);

    if (!activeWidget) return;

    activeWidget.resultsList.innerHTML = '';

    if (!Array.isArray(results) || !results.length) {
      activeWidget.resultsContainer.hidden = true;
      hideSongSearchResultsExcept(activeWidget);
      return;
    }

    results.forEach((result) => {
      const item = document.createElement('li');
      item.className = 'song-search-item';

      const main = document.createElement('div');
      main.className = 'song-search-main';

      const avatar = document.createElement('img');
      avatar.className = 'song-search-avatar';
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
      avatar.alt = result.artist ? `Foto de ${result.artist}` : 'Imagem da musica';
      avatar.src = (result.image_url || '').trim() || './assets/img/logo.png';
      avatar.addEventListener('error', () => {
        avatar.src = './assets/img/logo.png';
      });

      const info = document.createElement('div');
      info.className = 'song-search-info';
      const title = document.createElement('strong');
      title.textContent = result.title || 'Musica';
      const meta = document.createElement('p');
      const artist = (result.artist || '').trim();
      const sourceLabel = result.source_label || (result.source === 'cifraclub' ? 'Cifra Club' : 'Cifras');
      meta.textContent = artist ? `Cantor: ${artist} | Fonte: ${sourceLabel}` : `Fonte: ${sourceLabel}`;
      info.appendChild(title);
      info.appendChild(meta);
      main.appendChild(avatar);
      main.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'song-search-actions';
      const externalQuery = buildExternalSongSearchQuery(result);

      const spotifyAction = document.createElement('a');
      spotifyAction.className = 'song-search-action song-search-action-external';
      spotifyAction.innerHTML = SPOTIFY_ACTION_ICON;
      spotifyAction.title = 'Abrir no Spotify';
      spotifyAction.setAttribute('aria-label', 'Abrir no Spotify');
      const spotifyUrl = buildExternalSongSearchUrl('spotify', externalQuery);
      if (spotifyUrl) {
        spotifyAction.href = spotifyUrl;
        spotifyAction.target = '_blank';
        spotifyAction.rel = 'noopener noreferrer';
      } else {
        spotifyAction.classList.add('is-disabled');
        spotifyAction.setAttribute('aria-disabled', 'true');
      }

      const youtubeAction = document.createElement('a');
      youtubeAction.className = 'song-search-action song-search-action-external';
      youtubeAction.innerHTML = YOUTUBE_ACTION_ICON;
      youtubeAction.title = 'Abrir no YouTube';
      youtubeAction.setAttribute('aria-label', 'Abrir no YouTube');
      const youtubeUrl = buildExternalSongSearchUrl('youtube', externalQuery);
      if (youtubeUrl) {
        youtubeAction.href = youtubeUrl;
        youtubeAction.target = '_blank';
        youtubeAction.rel = 'noopener noreferrer';
      } else {
        youtubeAction.classList.add('is-disabled');
        youtubeAction.setAttribute('aria-disabled', 'true');
      }

      const lyricAction = document.createElement('button');
      lyricAction.type = 'button';
      lyricAction.className = 'song-search-action';
      lyricAction.textContent = 'Letra';
      lyricAction.disabled = !result.title && !result.url;
      lyricAction.addEventListener('click', () => {
        loadLyricsFromService(result, lyricAction);
      });

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action';
      chordAction.textContent = 'Cifra';
      chordAction.disabled = !result.url;
      chordAction.addEventListener('click', () => {
        loadSongFromUrl(result.url || '', chordAction, result);
      });

      actions.appendChild(spotifyAction);
      actions.appendChild(youtubeAction);
      actions.appendChild(lyricAction);
      actions.appendChild(chordAction);

      item.appendChild(main);
      item.appendChild(actions);
      activeWidget.resultsList.appendChild(item);
    });

    activeWidget.resultsContainer.hidden = false;
    hideSongSearchResultsExcept(activeWidget);
  };

  if (songToneGrid) {
    songToneGrid.innerHTML = '';
    TONE_BUTTON_ORDER.forEach((tone) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'song-tone-option';
      button.dataset.tone = tone;
      button.textContent = tone;

      button.addEventListener('click', () => {
        if (!songState.originalRoot) return;
        const originalIndex = NOTE_INDEX_MAP[songState.originalRoot];
        const targetRoot = canonicalNote(tone);
        if (!targetRoot || !Number.isInteger(originalIndex)) return;

        const targetIndex = NOTE_INDEX_MAP[targetRoot];
        let semitones = (targetIndex - originalIndex + 12) % 12;
        if (semitones > 6) semitones -= 12;
        songState.semitones = semitones;
        renderFetchedSong();
      });

      songToneGrid.appendChild(button);
    });
    updateToneButtonsState();
  }

  if (songToneResetBtn) {
    songToneResetBtn.addEventListener('click', () => {
      if (!songState.loaded || songState.semitones === 0) return;
      songState.semitones = 0;
      renderFetchedSong();
    });
  }

  const SONG_SEARCH_MIN_CHARS = 2;
  const SONG_SEARCH_DEBOUNCE_MS = 320;
  let songSearchDebounceId = null;
  let songSearchAbortController = null;
  let songSearchRequestId = 0;
  let lastSongSearchCache = {
    query: '',
    results: null
  };

  const normalizeSongSearchQuery = (value) => (value || '').trim().toLowerCase();

  const executeSongSearch = async (rawQuery, options = {}) => {
    const { fromTyping = false, widget = null } = options;
    const activeWidget = resolveSongSearchWidget(widget);
    const query = (rawQuery || '').trim();
    const normalizedQuery = normalizeSongSearchQuery(query);

    if (!query) {
      clearSongSearchResults();
      setSongFeedback('');
      if (!fromTyping) {
        setFetchSubmitState(false, 'Buscar musica');
      }
      return;
    }

    if (query.length < SONG_SEARCH_MIN_CHARS) {
      clearSongSearchResults(activeWidget);
      hideSongSearchResultsExcept(activeWidget);
      setSongFeedback(`Digite pelo menos ${SONG_SEARCH_MIN_CHARS} caracteres para buscar.`, '', activeWidget);
      if (!fromTyping) {
        setFetchSubmitState(false, 'Buscar musica');
      }
      return;
    }

    const hasCachedResults = (
      lastSongSearchCache.results !== null
      && lastSongSearchCache.query === normalizedQuery
    );
    if (hasCachedResults) {
      const cachedResults = Array.isArray(lastSongSearchCache.results) ? lastSongSearchCache.results : [];
      if (!cachedResults.length) {
        clearSongSearchResults(activeWidget);
        hideSongSearchResultsExcept(activeWidget);
        setSongFeedback('Nenhuma musica encontrada para este nome.', '', activeWidget);
      } else {
        renderSongSearchResults(cachedResults, activeWidget);
        setSongFeedback(`${cachedResults.length} opcoes encontradas. Escolha letra ou cifra para abrir.`, 'is-success', activeWidget);
      }
      if (!fromTyping) {
        setFetchSubmitState(false, 'Buscar musica');
      }
      return;
    }

    if (songSearchAbortController) {
      songSearchAbortController.abort();
    }

    const requestId = ++songSearchRequestId;
    songSearchAbortController = typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;

    if (!fromTyping) {
      setFetchSubmitState(true, 'Buscando...');
    }
    setSongFeedback('Buscando musicas nos portais...', 'is-loading', activeWidget);
    hideSongSearchResultsExcept(activeWidget);

    try {
      const response = await fetch('/api/songs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, limit: 18 }),
        signal: songSearchAbortController ? songSearchAbortController.signal : undefined
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || 'Nao foi possivel buscar musicas agora.';
        throw new Error(message);
      }

      // Ignore stale responses when the user keeps typing.
      if (requestId !== songSearchRequestId) {
        return;
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      lastSongSearchCache = {
        query: normalizedQuery,
        results
      };
      if (!results.length) {
        clearSongSearchResults(activeWidget);
        hideSongSearchResultsExcept(activeWidget);
        setSongFeedback('Nenhuma musica encontrada para este nome.', '', activeWidget);
        return;
      }

      renderSongSearchResults(results, activeWidget);
      setSongFeedback(`${results.length} opcoes encontradas. Escolha letra ou cifra para abrir.`, 'is-success', activeWidget);
    } catch (err) {
      if (err && typeof err === 'object' && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Falha ao buscar musicas.';
      setSongFeedback(message, 'is-error', activeWidget);
    } finally {
      if (requestId === songSearchRequestId) {
        songSearchAbortController = null;
      }
      if (!fromTyping) {
        setFetchSubmitState(false, 'Buscar musica');
      }
    }
  };

  const clearSongSearchState = (focusInput = null) => {
    if (!songSearchWidgets.length) return;
    songSearchWidgets.forEach((widget) => {
      widget.input.value = '';
    });
    clearSongSearchResults();
    setSongFeedback('');
    syncSongSearchClearButtons();
    if (focusInput) {
      focusInput.focus();
    }
  };

  if (songSearchWidgets.length) {
    syncSongSearchClearButtons();

    songSearchWidgets.forEach((widget) => {
      widget.resultsContainer.addEventListener('wheel', (event) => {
        // Keep wheel scrolling inside the results panel and avoid portal section navigation.
        event.stopPropagation();
      }, { passive: true });

      widget.input.addEventListener('input', () => {
        const query = widget.input.value.trim();
        syncSongSearchInputs(widget.input);
        syncSongSearchClearButtons();
        if (songSearchDebounceId) {
          window.clearTimeout(songSearchDebounceId);
          songSearchDebounceId = null;
        }

        if (!query) {
          clearSongSearchResults();
          setSongFeedback('');
          if (songSearchAbortController) {
            songSearchAbortController.abort();
          }
          return;
        }

        songSearchDebounceId = window.setTimeout(() => {
          executeSongSearch(query, { fromTyping: true, widget });
        }, SONG_SEARCH_DEBOUNCE_MS);
      });

      if (widget.searchBtn) {
        widget.searchBtn.addEventListener('click', async () => {
          if (songSearchDebounceId) {
            window.clearTimeout(songSearchDebounceId);
            songSearchDebounceId = null;
          }
          syncSongSearchInputs(widget.input);
          syncSongSearchClearButtons();
          await executeSongSearch(widget.input.value, { fromTyping: false, widget });
        });
      }

      widget.clearBtn.addEventListener('click', () => {
        if (songSearchDebounceId) {
          window.clearTimeout(songSearchDebounceId);
          songSearchDebounceId = null;
        }
        if (songSearchAbortController) {
          songSearchAbortController.abort();
        }

        songSearchRequestId += 1;
        clearSongSearchState(widget.input);
      });

      if (!widget.form) return;
      widget.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (songSearchDebounceId) {
          window.clearTimeout(songSearchDebounceId);
          songSearchDebounceId = null;
        }
        await executeSongSearch(widget.input.value, { fromTyping: false, widget });
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const clickedInsideSongSearch = songSearchWidgets.some((widget) => (
        (widget.form && widget.form.contains(target))
        || (widget.resultsContainer && widget.resultsContainer.contains(target))
        || (widget.searchBtn && widget.searchBtn.contains(target))
        || (widget.clearBtn && widget.clearBtn.contains(target))
        || (widget.input && widget.input.contains(target))
      ));

      if (clickedInsideSongSearch) return;
      hideSongSearchResultsExcept();
    });
  }

  if (songSearchClearBtn && songSearchQueryInput && !songSearchWidgets.length) {
    songSearchClearBtn.addEventListener('click', () => {
      if (songSearchDebounceId) {
        window.clearTimeout(songSearchDebounceId);
        songSearchDebounceId = null;
      }
      if (songSearchAbortController) {
        songSearchAbortController.abort();
      }

      songSearchRequestId += 1;
      clearSongSearchState(songSearchQueryInput);
    });
  }

  if (songSearchTriggerBtn && songSearchQueryInput && !songSearchWidgets.length) {
    songSearchTriggerBtn.addEventListener('click', async () => {
      if (songSearchDebounceId) {
        window.clearTimeout(songSearchDebounceId);
        songSearchDebounceId = null;
      }
      await executeSongSearch(songSearchQueryInput.value, { fromTyping: false });
    });
  }

  if (songFetchForm && songSearchQueryInput && !songSearchWidgets.length) {
    songFetchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (songSearchDebounceId) {
        window.clearTimeout(songSearchDebounceId);
        songSearchDebounceId = null;
      }
      await executeSongSearch(songSearchQueryInput.value, { fromTyping: false });
    });
  }

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
      if (isCompactMenuViewport()) {
        closeMainMenu();
      }
    }

    if (event.key === 'Escape' && mysteryModal && mysteryModal.classList.contains('open')) {
      closeMysteryModal();
    }

    if (event.key === 'Escape' && songModal && songModal.classList.contains('open')) {
      closeSongModal();
    }
  });
})();
