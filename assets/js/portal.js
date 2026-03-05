(async () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuList = document.getElementById('menu-list');
  const menuRootLevel = menuList ? menuList.querySelector('.dl-menu') : null;
  const menuCloseButtons = menuList ? menuList.querySelectorAll('[data-menu-close]') : [];
  const menuParentTriggers = menuList ? Array.from(menuList.querySelectorAll('.menu-parent-trigger')) : [];
  const menuBackTriggers = menuList ? Array.from(menuList.querySelectorAll('.menu-back-trigger')) : [];
  const authMenu = document.getElementById('auth-menu');
  const authMenuTrigger = document.getElementById('auth-menu-trigger');
  const authMenuDropdown = document.getElementById('auth-menu-dropdown');
  const authActionButtons = authMenuDropdown
    ? Array.from(authMenuDropdown.querySelectorAll('[data-auth-action]'))
    : [];
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
  const AUTH_TOKEN_KEY = 'portal_auth_token';
  const AUTH_USER_KEY = 'portal_auth_user';
  const AUTH_PASSWORD_MIN_LENGTH = 6;
  const AUTH_PASSWORD_MAX_LENGTH = 128;
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
  const ANCHOR_SCROLL_EXTRA_OFFSET = 32;
  const PORTAL_CONTENT_URL = './assets/data/portal-content.json';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const asObject = (value) => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  );
  const isPayloadReadError = (value) => {
    if (typeof value !== 'string') return false;
    return (
      value.includes("Cannot read properties of undefined (reading 'payload')")
      || value.includes('Cannot read properties of undefined (reading "payload")')
    );
  };
  const reportPayloadReadError = (() => {
    let reported = false;
    return (details) => {
      if (reported) return;
      reported = true;
      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map((node) => (node.getAttribute('src') || '').trim())
        .filter(Boolean);
      console.warn('[Portal] Erro detectado ao ler payload (possivel script externo).', {
        ...details,
        scripts
      });
    };
  })();

  window.addEventListener('error', (event) => {
    const message = typeof event.message === 'string' ? event.message : '';
    if (!isPayloadReadError(message)) return;
    reportPayloadReadError({
      channel: 'error',
      message,
      filename: typeof event.filename === 'string' ? event.filename : '',
      lineno: Number(event.lineno || 0),
      colno: Number(event.colno || 0)
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? (reason.message || '') : String(reason || '');
    const stack = reason instanceof Error ? (reason.stack || '') : '';
    if (!isPayloadReadError(message) && !isPayloadReadError(stack)) return;
    reportPayloadReadError({
      channel: 'unhandledrejection',
      message,
      stack
    });
  });

  const getNestedValue = (payload, path) => (
    path.split('.').reduce((acc, key) => (
      acc && typeof acc === 'object' ? acc[key] : undefined
    ), payload)
  );
  const formatTemplate = (template, replacements = {}) => (
    String(template || '').replace(/\{(\w+)\}/g, (_match, key) => (
      Object.prototype.hasOwnProperty.call(replacements, key)
        ? String(replacements[key])
        : ''
    ))
  );
  const loadPortalContent = async () => {
    try {
      const response = await fetch(PORTAL_CONTENT_URL, { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = await response.json();
      return payload && typeof payload === 'object' ? payload : null;
    } catch (err) {
      return null;
    }
  };

  const portalContent = await loadPortalContent();
  const runDeferredTask = (task, delayMs = 0) => {
    window.setTimeout(() => {
      void task();
    }, Math.max(0, Number(delayMs) || 0));
  };
  const readUiMessage = (path, fallback = '') => {
    const value = getNestedValue(portalContent, `uiMessages.${path}`);
    return typeof value === 'string' ? value : fallback;
  };
  const resolveMessageArgs = (fallback = '', replacements = null) => {
    const fallbackLooksLikeReplacements = (
      fallback
      && typeof fallback === 'object'
      && !Array.isArray(fallback)
      && replacements == null
    );
    if (fallbackLooksLikeReplacements) {
      return { fallback: '', replacements: fallback };
    }
    return {
      fallback: typeof fallback === 'string' ? fallback : '',
      replacements: replacements && typeof replacements === 'object' ? replacements : null,
    };
  };
  const readSongMessage = (key, fallback = '', replacements = null) => {
    const safeArgs = resolveMessageArgs(fallback, replacements);
    const template = readUiMessage(`song.${key}`, safeArgs.fallback);
    return safeArgs.replacements ? formatTemplate(template, safeArgs.replacements) : template;
  };
  const readMysteryMessage = (key, fallback = '', replacements = null) => {
    const safeArgs = resolveMessageArgs(fallback, replacements);
    const template = readUiMessage(`mystery.${key}`, safeArgs.fallback);
    return safeArgs.replacements ? formatTemplate(template, safeArgs.replacements) : template;
  };
  const readRosaryMessage = (key, fallback = '', replacements = null) => {
    const safeArgs = resolveMessageArgs(fallback, replacements);
    const template = readUiMessage(`rosary.${key}`, safeArgs.fallback);
    return safeArgs.replacements ? formatTemplate(template, safeArgs.replacements) : template;
  };
  const readStepCardMessage = (key, fallback = '') => readUiMessage(`stepCard.${key}`, fallback);
  const SONG_SEARCH_BUTTON_ICON = [
    '<svg viewBox="0 0 24 24" aria-hidden="true">',
    '<circle cx="11" cy="11" r="6"></circle>',
    '<path d="M16 16l5 5"></path>',
    '</svg>'
  ].join('');
  const MYSTERY_MUSIC_NOTE_ICON = [
    '<svg viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M17 11a5 5 0 0 1-10 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M12 16v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M9 20h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '</svg>'
  ].join('');
  const SONG_ASSIGN_PLUS_ICON = [
    '<svg class="song-search-action-icon" viewBox="0 0 24 24" aria-hidden="true">',
    '<circle cx="12" cy="12" r="8.6"></circle>',
    '<path d="M12 8v8M8 12h8"></path>',
    '</svg>'
  ].join('');

  const setNodeText = (selector, value) => {
    if (typeof value !== 'string') return;
    const node = document.querySelector(selector);
    if (node) {
      node.textContent = value;
    }
  };
  const formatMysteryItemLabel = (value, index) => {
    if (typeof value !== 'string') return '';
    const cleanValue = value.trim();
    if (!cleanValue) return '';
    if (/^\d+\s*[ºo]\s+/i.test(cleanValue)) return cleanValue;
    return `${index + 1}º ${cleanValue}`;
  };
  const setNodeAttr = (selector, attr, value) => {
    if (typeof value !== 'string') return;
    const node = document.querySelector(selector);
    if (node) {
      node.setAttribute(attr, value);
    }
  };
  const resolveRoteiroStepCopy = (stepConfig, field) => {
    const safeStepConfig = asObject(stepConfig);
    const keyField = (
      field === 'content'
        ? 'contentKey'
        : (field === 'title' ? 'titleKey' : 'textKey')
    );
    const messagePath = String(safeStepConfig[keyField] || '').trim();
    if (messagePath) {
      return readUiMessage(messagePath);
    }
    const rawValue = safeStepConfig[field];
    return typeof rawValue === 'string' ? rawValue : '';
  };
  const STEP_CARD_LABEL_OPEN = readStepCardMessage('openLabel');
  const STEP_CARD_LABEL_CLOSED = readStepCardMessage('closedLabel');
  const setStepCardExpanded = (stepNode, expanded) => {
    if (!(stepNode instanceof HTMLElement)) return;
    const contentNode = stepNode.querySelector('.step-card-content');
    const hintNode = stepNode.querySelector('.step-card-hint');
    if (!(contentNode instanceof HTMLElement)) return;

    const isExpanded = Boolean(expanded);
    stepNode.classList.toggle('open', isExpanded);
    stepNode.setAttribute('aria-expanded', String(isExpanded));
    contentNode.hidden = !isExpanded;

    if (hintNode instanceof HTMLElement) {
      hintNode.textContent = isExpanded ? STEP_CARD_LABEL_OPEN : STEP_CARD_LABEL_CLOSED;
    }
  };
  const ensureStepCardDetailNodes = (stepNode) => {
    if (!(stepNode instanceof HTMLElement)) return null;

    let hintNode = stepNode.querySelector('.step-card-hint');
    if (!(hintNode instanceof HTMLElement)) {
      hintNode = document.createElement('p');
      hintNode.className = 'step-card-hint';
      stepNode.appendChild(hintNode);
    }

    let contentNode = stepNode.querySelector('.step-card-content');
    if (!(contentNode instanceof HTMLElement)) {
      contentNode = document.createElement('div');
      contentNode.className = 'step-card-content';
      stepNode.appendChild(contentNode);
    }

    return { hintNode, contentNode };
  };
  const bindStepCardToggle = (stepNode) => {
    if (!(stepNode instanceof HTMLElement)) return;
    if (stepNode.dataset.stepCardBound === '1') return;
    stepNode.dataset.stepCardBound = '1';

    const closeOtherStepCards = () => {
      const openStepCards = Array.from(document.querySelectorAll('#roteiro .step-card.step-card-expandable.open'));
      openStepCards.forEach((openCard) => {
        if (openCard === stepNode) return;
        setStepCardExpanded(openCard, false);
      });
    };

    const toggle = () => {
      if (!stepNode.classList.contains('step-card-expandable')) return;
      const nextExpanded = !stepNode.classList.contains('open');
      if (nextExpanded) {
        closeOtherStepCards();
      }
      setStepCardExpanded(stepNode, nextExpanded);
    };

    stepNode.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a, button, input, textarea, select')) {
        return;
      }
      toggle();
    });

    stepNode.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
  };
  const updateLinksFromConfig = (links, linkConfig) => {
    if (!Array.isArray(links) || !Array.isArray(linkConfig)) return;
    links.forEach((link, index) => {
      const config = linkConfig[index];
      if (!config || !link) return;
      if (typeof config.label === 'string') {
        link.textContent = config.label;
      }
      if (typeof config.href === 'string') {
        link.setAttribute('href', config.href);
      }
      if (config.target === '_blank') {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
      }
    });
  };

  const applyPortalContentToDom = (content) => {
    if (!content || typeof content !== 'object') return;

    if (typeof content.meta?.title === 'string') {
      document.title = content.meta.title;
    }
    if (typeof content.meta?.description === 'string') {
      const descriptionMeta = document.querySelector('meta[name="description"]');
      if (descriptionMeta) {
        descriptionMeta.setAttribute('content', content.meta.description);
      }
    }

    setNodeText('.brand-text strong', content.brand?.primary);
    setNodeText('.brand-text small', content.brand?.secondary);
    setNodeAttr('.brand-mark img', 'src', content.brand?.logo?.src);
    setNodeAttr('.brand-mark img', 'alt', content.brand?.logo?.alt);
    setNodeAttr('.menu-toggle', 'aria-label', readUiMessage('menu.openAria'));

    if (menuList && typeof content.menu?.ariaLabel === 'string') {
      menuList.setAttribute('aria-label', content.menu.ariaLabel);
    }
    if (typeof content.menu?.closeButtonLabel === 'string') {
      document.querySelectorAll('[data-menu-close]').forEach((button) => {
        button.setAttribute('aria-label', content.menu.closeButtonLabel);
      });
    }
    if (typeof content.menu?.backButtonLabel === 'string') {
      document.querySelectorAll('.menu-back-trigger').forEach((button) => {
        button.textContent = content.menu.backButtonLabel;
      });
    }
    if (menuRootLevel && Array.isArray(content.menu?.items)) {
      const topLevelItems = Array.from(menuRootLevel.children);
      content.menu.items.forEach((itemConfig, index) => {
        const itemNode = topLevelItems[index];
        if (!itemNode || !itemConfig) return;

        const directLink = itemNode.querySelector(':scope > a');
        const parentTrigger = itemNode.querySelector(':scope > .menu-parent-trigger');

        if (directLink) {
          if (typeof itemConfig.label === 'string') {
            directLink.textContent = itemConfig.label;
          }
          if (typeof itemConfig.href === 'string') {
            directLink.setAttribute('href', itemConfig.href);
          }
        }

        if (parentTrigger && typeof itemConfig.label === 'string') {
          parentTrigger.textContent = itemConfig.label;
        }
        if (parentTrigger && Array.isArray(itemConfig.subLinks)) {
          const subLinks = Array.from(itemNode.querySelectorAll('.dl-submenu > li:not(.dl-back) > a'));
          updateLinksFromConfig(subLinks, itemConfig.subLinks);
        }
      });
    }
    setNodeAttr('.font-controls', 'aria-label', readUiMessage('controls.fontGroupAria'));
    setNodeAttr('#font-decrease', 'aria-label', readUiMessage('controls.fontDecreaseAria'));
    setNodeAttr('#font-increase', 'aria-label', readUiMessage('controls.fontIncreaseAria'));
    setNodeText('#font-decrease', readUiMessage('controls.fontDecreaseLabel'));
    setNodeText('#font-increase', readUiMessage('controls.fontIncreaseLabel'));
    setNodeAttr('#theme-toggle', 'aria-label', readUiMessage('theme.toggleAria'));

    setNodeText('#inicio .eyebrow', content.hero?.eyebrow);
    setNodeText('#inicio h1', content.hero?.title);
    setNodeText('#inicio .hero-lead', content.hero?.lead);
    const heroActionLinks = Array.from(document.querySelectorAll('#inicio .hero-actions a'));
    const heroActionsConfig = Array.isArray(content.hero?.actions) ? content.hero.actions : [];
    updateLinksFromConfig(heroActionLinks, heroActionsConfig);
    if (heroActionsConfig.length) {
      heroActionLinks.forEach((link, index) => {
        const item = heroActionsConfig[index];
        const hasLabel = Boolean(typeof item?.label === 'string' && item.label.trim());
        link.hidden = !hasLabel;
        if (hasLabel) {
          link.removeAttribute('aria-hidden');
        } else {
          link.setAttribute('aria-hidden', 'true');
        }
      });
    } else {
      heroActionLinks.forEach((link) => {
        link.hidden = false;
        link.removeAttribute('aria-hidden');
      });
    }
    setNodeText('#inicio .today-label', content.hero?.today?.label);
    setNodeText('#inicio .today-note', content.hero?.today?.note);
    setNodeAttr('#inicio .today-visual img', 'src', content.hero?.today?.image?.src);
    setNodeAttr('#inicio .today-visual img', 'alt', content.hero?.today?.image?.alt);

    setNodeText('#historia .section-header .section-kicker', content.historia?.header?.kicker);
    setNodeText('#historia .section-header h2', content.historia?.header?.title);
    setNodeText('#historia .section-header p', content.historia?.header?.description);
    setNodeText('#historia .story-intro', content.historia?.intro);
    setNodeAttr('#historia .story-tabs', 'aria-label', content.historia?.tabsAriaLabel);
    setNodeAttr('#historia iframe[data-youtube-embed]', 'src', content.historia?.video?.embedUrl);
    setNodeAttr('#historia iframe[data-youtube-embed]', 'title', content.historia?.video?.title);
    const storyFallback = document.querySelector('#historia .story-video-fallback');
    if (storyFallback && typeof content.historia?.video?.fallbackText === 'string') {
      const fallbackLink = storyFallback.querySelector('a');
      storyFallback.innerHTML = '';
      storyFallback.append(document.createTextNode(`${content.historia.video.fallbackText} `));
      if (fallbackLink) {
        if (typeof content.historia.video.fallbackLinkLabel === 'string') {
          fallbackLink.textContent = content.historia.video.fallbackLinkLabel;
        }
        if (typeof content.historia.video.fallbackLinkUrl === 'string') {
          fallbackLink.setAttribute('href', content.historia.video.fallbackLinkUrl);
        }
      }
      if (fallbackLink) {
        storyFallback.appendChild(fallbackLink);
      }
      storyFallback.append(document.createTextNode('.'));
    }
    setNodeText('#historia .story-video-note', content.historia?.video?.note);

    if (Array.isArray(content.historia?.tabs)) {
      const storyTabNodes = Array.from(document.querySelectorAll('#historia .story-tab'));
      content.historia.tabs.forEach((tabConfig, index) => {
        const tabNode = storyTabNodes[index];
        if (!tabNode) return;
        if (typeof tabConfig.label === 'string') {
          tabNode.textContent = tabConfig.label;
        }
        if (typeof tabConfig.id === 'string') {
          tabNode.dataset.storyId = tabConfig.id;
        }
      });
    }
    if (Array.isArray(content.historia?.timeline)) {
      const timelineNodes = Array.from(document.querySelectorAll('#historia .story-timeline-item'));
      timelineNodes.forEach((timelineNode, index) => {
        const timelineItem = content.historia.timeline[index];
        if (!timelineItem) return;
        const yearNode = timelineNode.querySelector('span');
        const textNode = timelineNode.querySelector('p');
        if (yearNode && typeof timelineItem.year === 'string') {
          yearNode.textContent = timelineItem.year;
        }
        if (textNode && typeof timelineItem.text === 'string') {
          textNode.textContent = timelineItem.text;
        }
      });
    }

    setNodeText('#roteiro .section-header .section-kicker', content.roteiro?.header?.kicker);
    setNodeText('#roteiro .section-header h2', content.roteiro?.header?.title);
    setNodeText('#roteiro .section-header p', content.roteiro?.header?.description);
    if (Array.isArray(content.roteiro?.steps)) {
      const stepNodes = Array.from(document.querySelectorAll('#roteiro .step-card'));
      stepNodes.forEach((stepNode, index) => {
        const stepConfig = content.roteiro.steps[index];
        if (!stepConfig) return;
        const numberNode = stepNode.querySelector('.step-number');
        const titleNode = stepNode.querySelector('h3');
        const textNode = stepNode.querySelector('p');
        if (numberNode && typeof stepConfig.number === 'string') {
          numberNode.textContent = stepConfig.number;
        }
        const titleText = resolveRoteiroStepCopy(stepConfig, 'title');
        if (titleNode) {
          titleNode.textContent = titleText;
        }
        const summaryText = resolveRoteiroStepCopy(stepConfig, 'text');
        if (textNode) {
          textNode.textContent = summaryText;
        }
        stepNode.classList.toggle('highlight', Boolean(stepConfig.highlight));

        const detailText = resolveRoteiroStepCopy(stepConfig, 'content').trim();
        const detailNodes = ensureStepCardDetailNodes(stepNode);
        if (detailNodes && detailText) {
          detailNodes.contentNode.textContent = detailText;
          stepNode.classList.add('step-card-expandable');
          stepNode.setAttribute('role', 'button');
          stepNode.setAttribute('tabindex', '0');
          bindStepCardToggle(stepNode);
          setStepCardExpanded(stepNode, false);
        } else {
          stepNode.classList.remove('step-card-expandable', 'open');
          stepNode.removeAttribute('role');
          stepNode.removeAttribute('tabindex');
          stepNode.removeAttribute('aria-expanded');
          if (detailNodes) {
            detailNodes.contentNode.hidden = true;
            detailNodes.contentNode.textContent = '';
            detailNodes.hintNode.textContent = '';
          }
        }
      });
    }

    setNodeText('#misterios .section-header .section-kicker', content.misterios?.header?.kicker);
    setNodeText('#misterios .section-header h2', content.misterios?.header?.title);
    setNodeText('#misterios .section-header p', content.misterios?.header?.description);
    if (Array.isArray(content.misterios?.cards)) {
      const cardNodes = Array.from(document.querySelectorAll('#misterios .mystery-card'));
      cardNodes.forEach((cardNode, index) => {
        const cardConfig = content.misterios.cards[index];
        if (!cardConfig) return;
        const dayNode = cardNode.querySelector('.mystery-day');
        const titleNode = cardNode.querySelector('h3');
        const listNode = cardNode.querySelector('ul');
        if (dayNode && typeof cardConfig.day === 'string') {
          dayNode.textContent = cardConfig.day;
        }
        if (titleNode && typeof cardConfig.title === 'string') {
          titleNode.textContent = cardConfig.title;
        }
        if (listNode && Array.isArray(cardConfig.items)) {
          listNode.innerHTML = '';
          cardConfig.items.forEach((itemText, itemIndex) => {
            const itemNode = document.createElement('li');
            itemNode.textContent = formatMysteryItemLabel(itemText, itemIndex);
            listNode.appendChild(itemNode);
          });
        }
      });
    }

    setNodeText('#cantos .section-header .section-kicker', content.cantos?.header?.kicker);
    setNodeText('#cantos .section-header h2', content.cantos?.header?.title);
    setNodeText('#cantos .section-header > p:not(.section-kicker)', content.cantos?.header?.description);
    setNodeText('#song-fetch-form label[for=\"song-search-query\"]', content.cantos?.search?.menuLabel);
    setNodeAttr('#song-search-query', 'placeholder', content.cantos?.search?.menuPlaceholder);
    setNodeText('#song-fetch-form-cantos label[for=\"song-search-query-cantos\"]', content.cantos?.search?.cantosLabel);
    setNodeAttr('#song-search-query-cantos', 'placeholder', content.cantos?.search?.cantosPlaceholder);
    setNodeAttr('#song-search-trigger', 'aria-label', content.cantos?.search?.searchButtonLabel);
    setNodeAttr('#song-search-trigger', 'title', content.cantos?.search?.searchButtonLabel);
    setNodeAttr('#song-search-trigger-cantos', 'aria-label', content.cantos?.search?.searchButtonLabel);
    setNodeAttr('#song-search-trigger-cantos', 'title', content.cantos?.search?.searchButtonLabel);
    setNodeAttr('#song-search-clear', 'aria-label', content.cantos?.search?.clearButtonLabel);
    setNodeAttr('#song-search-clear', 'title', content.cantos?.search?.clearButtonLabel);
    setNodeAttr('#song-search-clear-cantos', 'aria-label', content.cantos?.search?.clearButtonLabel);
    setNodeAttr('#song-search-clear-cantos', 'title', content.cantos?.search?.clearButtonLabel);
    setNodeText('#song-favorites-title', content.cantos?.favorites?.title);
    setNodeText('#song-share-import-btn', readSongMessage('shareImportButton', 'Importar'));
    setNodeAttr('#song-share-import-btn', 'aria-label', readSongMessage('shareImportButtonAria', 'Importar lista compartilhada'));
    setNodeAttr('#song-share-import-btn', 'title', readSongMessage('shareImportButtonAria', 'Importar lista compartilhada'));
    setNodeText('#song-favorites-description', content.cantos?.favorites?.description);
    setNodeText('#song-favorites-share-btn', readSongMessage('favoritesShareButton', 'Compartilhar'));
    setNodeAttr(
      '#song-favorites-share-btn',
      'aria-label',
      readSongMessage('favoritesShareButtonAria', 'Compartilhar suas musicas por link e QR Code')
    );
    setNodeAttr(
      '#song-favorites-share-btn',
      'title',
      readSongMessage('favoritesShareButtonAria', 'Compartilhar suas musicas por link e QR Code')
    );
    setNodeText('#hero-share-songs-btn', readSongMessage('favoritesShareButton', 'Compartilhar'));
    setNodeAttr(
      '#hero-share-songs-btn',
      'aria-label',
      readSongMessage('favoritesShareButtonAria', 'Compartilhar suas musicas por link e QR Code')
    );
    setNodeAttr(
      '#hero-share-songs-btn',
      'title',
      readSongMessage('favoritesShareButtonAria', 'Compartilhar suas musicas por link e QR Code')
    );
    setNodeAttr(
      '#song-favorites-search-input',
      'placeholder',
      readSongMessage('favoritesSearchPlaceholder')
    );
    setNodeAttr(
      '#song-favorites-search-input',
      'aria-label',
      readSongMessage('favoritesSearchAria')
    );
    setNodeAttr(
      '#song-favorites-search-input',
      'title',
      readSongMessage('favoritesSearchAria')
    );
    setNodeText('#custom-songs-title', readSongMessage('customSongsTitle'));
    setNodeText('#custom-songs-description', readSongMessage('customSongsDescription'));
    setNodeText('#custom-songs-add-btn', readSongMessage('customSongsAddButton'));
    setNodeText('#booklet-cantos-title', content.cantos?.booklet?.title);
    setNodeText('#booklet-cantos-description', content.cantos?.booklet?.description);
    if (Array.isArray(content.cantos?.booklet?.items)) {
      const bookletList = document.getElementById('booklet-cantos-list');
      if (bookletList) {
        bookletList.innerHTML = '';
        content.cantos.booklet.items.forEach((item) => {
          if (!item || typeof item.title !== 'string') return;

          const li = document.createElement('li');
          li.className = 'booklet-cantos-item';

          const head = document.createElement('div');
          head.className = 'booklet-cantos-head';

          const searchButton = document.createElement('button');
          searchButton.type = 'button';
          searchButton.className = 'booklet-cantos-search-btn';
          const query = (typeof item.searchQuery === 'string' && item.searchQuery.trim())
            ? item.searchQuery.trim()
            : item.title;
          searchButton.dataset.bookletSongQuery = query;
          const searchAria = readSongMessage('bookletSearchAria', { query });
          searchButton.setAttribute('aria-label', searchAria);
          searchButton.setAttribute('title', searchAria);
          searchButton.innerHTML = SONG_SEARCH_BUTTON_ICON;

          const title = document.createElement('strong');
          title.className = 'booklet-cantos-title';
          title.textContent = item.title;

          const meta = document.createElement('p');
          meta.className = 'booklet-cantos-meta';
          const pagePrefix = readSongMessage('bookletPagePrefix');
          const pageLabel = typeof item.page === 'string' && item.page.trim()
            ? `${pagePrefix} ${item.page.trim()}`
            : '';
          const statusLabel = typeof item.status === 'string' ? item.status : '';
          meta.textContent = [pageLabel, statusLabel].filter(Boolean).join(' | ');

          head.appendChild(searchButton);
          head.appendChild(title);
          li.appendChild(head);
          if (meta.textContent) {
            li.appendChild(meta);
          }
          bookletList.appendChild(li);
        });
      }
    }
    setNodeAttr('.song-modal-close', 'aria-label', readSongMessage('closeModalAria'));
    setNodeText('#fetched-song-title', readSongMessage('loadedSongTitle'));
    setNodeText('#fetched-song-meta', readSongMessage('originalKeyUnknownTemplate'));
    setNodeText('.song-modal-tone-label', readSongMessage('toneLabel'));
    setNodeAttr('#song-tone-grid', 'aria-label', readSongMessage('tonePickerAriaLabel'));
    setNodeText('#song-tone-reset', readSongMessage('toneResetLabel'));
    setNodeText('#favorite-confirm-title', readSongMessage('favoriteRemoveConfirmTitle'));
    setNodeText('#favorite-confirm-cancel', readSongMessage('favoriteRemoveConfirmCancel'));
    setNodeText('#favorite-confirm-accept', readSongMessage('favoriteRemoveConfirmAccept'));
    setNodeText(
      '#favorite-confirm-password-label',
      readMysteryMessage('assignCategoryDeactivatePasswordLabel')
    );
    setNodeText(
      '#favorite-confirm-password-error',
      readMysteryMessage('assignCategoryDeactivatePasswordRequired')
    );
    setNodeAttr(
      '#favorite-confirm-password-input',
      'placeholder',
      readMysteryMessage('assignCategoryDeactivatePasswordPlaceholder')
    );
    setNodeAttr(
      '#favorite-confirm-password-input',
      'aria-label',
      readMysteryMessage('assignCategoryDeactivatePasswordLabel')
    );
    setNodeText('#custom-song-modal-title', readSongMessage('customSongModalTitle'));
    setNodeText('#custom-song-title-label', readSongMessage('customSongTitleLabel'));
    setNodeText('#custom-song-key-label', readSongMessage('customSongKeyLabel'));
    setNodeText('#custom-song-tab-lyrics', readSongMessage('customSongLyricsTab'));
    setNodeText('#custom-song-tab-chords', readSongMessage('customSongChordsTab'));
    setNodeText('#custom-song-lyrics-label', readSongMessage('customSongLyricsLabel'));
    setNodeText('#custom-song-chords-label', readSongMessage('customSongChordsLabel'));
    setNodeText('#custom-song-cancel-btn', readSongMessage('customSongCancelButton'));
    setNodeText('#custom-song-save-btn', readSongMessage('customSongSaveButton'));
    setNodeAttr('#custom-song-title-input', 'placeholder', readSongMessage('customSongTitlePlaceholder'));
    setNodeAttr('#custom-song-key-input', 'placeholder', readSongMessage('customSongKeyPlaceholder'));
    setNodeAttr('#custom-song-lyrics-input', 'placeholder', readSongMessage('customSongLyricsPlaceholder'));
    setNodeAttr('#custom-song-chords-input', 'placeholder', readSongMessage('customSongChordsPlaceholder'));
    setNodeAttr('#custom-song-modal-close', 'aria-label', readSongMessage('customSongCloseAria'));
    setNodeAttr('#custom-song-modal-close', 'title', readSongMessage('customSongCloseAria'));
    setNodeText(
      '#favorite-confirm-message',
      readSongMessage('favoriteRemoveConfirmMessage')
    );
    setNodeText('#song-save-location-picker-breadcrumb', readMysteryMessage('assignCategorySelect'));
    setNodeText('#song-save-location-picker-back', readMysteryMessage('assignCategoryBack'));
    setNodeAttr(
      '#song-save-location-picker-search',
      'placeholder',
      readMysteryMessage('assignSearchPlaceholder')
    );
    setNodeAttr(
      '#song-save-location-picker-search',
      'aria-label',
      readMysteryMessage('assignSearchAria')
    );
    setNodeAttr(
      '#song-save-location-picker-close',
      'aria-label',
      readMysteryMessage('assignCategoryCloseAria')
    );
    setNodeAttr(
      '#song-save-location-picker-close',
      'title',
      readMysteryMessage('assignCategoryCloseAria')
    );
    setNodeText('#song-save-location-picker-add', '+');
    setNodeAttr(
      '#song-save-location-picker-add',
      'aria-label',
      readMysteryMessage('assignCategoryAddPromptRoot')
    );
    setNodeAttr(
      '#song-save-location-picker-add',
      'title',
      readMysteryMessage('assignCategoryAddPromptRoot')
    );
    setNodeAttr(
      '#song-location-create-parent',
      'placeholder',
      readMysteryMessage('assignSearchPlaceholder')
    );
    setNodeAttr(
      '#song-location-create-parent',
      'aria-label',
      readMysteryMessage('assignCategoryAddTargetField')
    );

    setNodeText('#oracoes .section-header .section-kicker', content.oracoes?.header?.kicker);
    setNodeText('#oracoes .section-header h2', content.oracoes?.header?.title);
    setNodeText('#oracoes .section-header p', content.oracoes?.header?.description);
    if (Array.isArray(content.oracoes?.items)) {
      const prayerGrid = document.querySelector('#oracoes .prayer-grid');
      const openLabel = content.oracoes?.accordion?.openLabel || readUiMessage('oracoes.accordionOpenLabel');
      const closedLabel = content.oracoes?.accordion?.closedLabel || readUiMessage('oracoes.accordionClosedLabel');
      if (prayerGrid) {
        prayerGrid.innerHTML = '';
        content.oracoes.items.forEach((prayerConfig) => {
          if (!prayerConfig || typeof prayerConfig.title !== 'string') return;

          const prayerNode = document.createElement('article');
          prayerNode.className = 'prayer-card';
          prayerNode.setAttribute('data-accordion', '');

          const headNode = document.createElement('div');
          headNode.className = 'prayer-card-head';

          const titleNode = document.createElement('h3');
          titleNode.textContent = prayerConfig.title;

          const triggerNode = document.createElement('button');
          triggerNode.className = 'accordion-trigger';
          triggerNode.type = 'button';
          triggerNode.setAttribute('data-accordion-trigger', '');
          triggerNode.dataset.openLabel = openLabel;
          triggerNode.dataset.closedLabel = closedLabel;

          const bodyNode = document.createElement('div');
          bodyNode.className = 'accordion-body';
          bodyNode.setAttribute('data-accordion-body', '');

          const textNode = document.createElement('p');
          textNode.textContent = typeof prayerConfig.text === 'string' ? prayerConfig.text : '';

          bodyNode.appendChild(textNode);
          headNode.appendChild(titleNode);
          headNode.appendChild(triggerNode);
          prayerNode.appendChild(headNode);
          prayerNode.appendChild(bodyNode);
          prayerGrid.appendChild(prayerNode);
        });
      }
    }

    setNodeText('#santuarios .section-header .section-kicker', content.santuarios?.header?.kicker);
    setNodeText('#santuarios .section-header h2', content.santuarios?.header?.title);
    setNodeText('#santuarios .section-header p', content.santuarios?.header?.description);
    if (Array.isArray(content.santuarios?.items)) {
      const sanctuaryList = document.getElementById('santuarios-list');
      if (sanctuaryList) {
        sanctuaryList.innerHTML = '';
        content.santuarios.items.forEach((item) => {
          if (!item || typeof item.name !== 'string') return;

          const card = document.createElement('article');
          card.className = 'sanctuary-card';

          const title = document.createElement('h3');
          title.textContent = item.name;
          card.appendChild(title);

          if (typeof item.city === 'string' && item.city.trim()) {
            const city = document.createElement('p');
            city.className = 'sanctuary-city';
            city.textContent = item.city;
            card.appendChild(city);
          }

          if (typeof item.description === 'string' && item.description.trim()) {
            const description = document.createElement('p');
            description.textContent = item.description;
            card.appendChild(description);
          }

          if (typeof item.url === 'string' && item.url.trim()) {
            const action = document.createElement('a');
            action.className = 'btn btn-ghost sanctuary-link';
            action.href = item.url;
            action.target = '_blank';
            action.rel = 'noopener';
            action.textContent = item.linkLabel || readUiMessage('common.openActionLabel');
            card.appendChild(action);
          }

          sanctuaryList.appendChild(card);
        });
      }
    }

    setNodeText('#sementes .section-header .section-kicker', content.sementes?.header?.kicker);
    setNodeText('#sementes .section-header h2', content.sementes?.header?.title);
    setNodeText('#sementes .section-header p', content.sementes?.header?.description);
    setNodeText('#sementes .sementes-badge', content.sementes?.card?.badge);
    setNodeText('#sementes .sementes-card h3', content.sementes?.card?.title);
    setNodeText('#sementes .sementes-card p:nth-of-type(2)', content.sementes?.card?.text);
    updateLinksFromConfig(
      Array.from(document.querySelectorAll('#sementes .sementes-actions a')),
      content.sementes?.actions || []
    );

    setNodeText('#recursos .section-header .section-kicker', content.recursos?.header?.kicker);
    setNodeText('#recursos .section-header h2', content.recursos?.header?.title);
    setNodeText('#recursos .section-header p', content.recursos?.header?.description);
    if (Array.isArray(content.recursos?.items)) {
      const resourceNodes = Array.from(document.querySelectorAll('#recursos .resource-card'));
      resourceNodes.forEach((resourceNode, index) => {
        const resourceConfig = content.recursos.items[index];
        if (!resourceConfig) return;
        const titleNode = resourceNode.querySelector('h3');
        const textNode = resourceNode.querySelector('p');
        if (titleNode && typeof resourceConfig.title === 'string') {
          titleNode.textContent = resourceConfig.title;
        }
        if (textNode && typeof resourceConfig.text === 'string') {
          textNode.textContent = resourceConfig.text;
        }
      });
    }

    setNodeText('.site-footer .footer-row p', content.footer?.text);
    setNodeText('.site-footer .footer-row a', content.footer?.backToTopLabel);

    setNodeAttr('#mystery-modal-links', 'aria-label', content.misterios?.modal?.linksAriaLabel);
    setNodeAttr('#mystery-modal-links', 'data-label', readMysteryMessage('modalLinksLabel'));
    setNodeAttr('.mystery-modal-close', 'aria-label', content.misterios?.modal?.closeAriaLabel);
    setNodeAttr(
      '#mystery-jaculatory-close',
      'aria-label',
      readMysteryMessage('closeJaculatoryAria')
    );
    setNodeAttr(
      '#mystery-jaculatory-close',
      'title',
      readMysteryMessage('closeJaculatoryAria')
    );
    setNodeAttr(
      '#mystery-modal-song-close',
      'aria-label',
      readMysteryMessage('closeSongPanelAria')
    );
    setNodeAttr(
      '#mystery-modal-song-close',
      'title',
      readMysteryMessage('closeSongPanelAria')
    );
    setNodeText('#mystery-jaculatory-toggle', content.misterios?.modal?.toggleShow);
    setNodeText('#mystery-jaculatory-panel .mystery-jaculatory-title', content.misterios?.modal?.jaculatoryTitle);
    setNodeText(
      '#mystery-group-modal-title',
      readMysteryMessage('groupPickerTitle')
    );
    setNodeAttr(
      '#mystery-group-modal-options',
      'aria-label',
      readMysteryMessage('groupPickerAria')
    );
    setNodeAttr(
      '.mystery-group-modal-close',
      'aria-label',
      readMysteryMessage('groupPickerCloseAria')
    );
    setNodeAttr(
      '.mystery-group-modal-close',
      'title',
      readMysteryMessage('groupPickerCloseAria')
    );
    setNodeText('#mystery-song-assign-title', readMysteryMessage('assignModalTitle'));
    setNodeAttr('.mystery-song-assign-close', 'aria-label', readMysteryMessage('assignCategoryCloseAria'));
    setNodeAttr('.mystery-song-assign-close', 'title', readMysteryMessage('assignCategoryCloseAria'));
    setNodeAttr('.custom-song-tabs', 'aria-label', readSongMessage('customSongEditorAria'));
    setNodeText('#mystery-ave-maria-panel .mystery-ave-maria-title', readMysteryMessage('aveMariaTitle'));
    setNodeAttr(
      '#mystery-ave-maria-options',
      'aria-label',
      readMysteryMessage('aveMariaAria')
    );
    setNodeAttr(
      '.rosary-modal-close',
      'aria-label',
      readRosaryMessage('closeAria')
    );
    setNodeAttr(
      '.rosary-modal-close',
      'title',
      readRosaryMessage('closeAria')
    );
    setNodeAttr(
      '#rosary-modal-song-close',
      'aria-label',
      readRosaryMessage('closeSongPanelAria', readMysteryMessage('closeSongPanelAria'))
    );
    setNodeAttr(
      '#rosary-modal-song-close',
      'title',
      readRosaryMessage('closeSongPanelAria', readMysteryMessage('closeSongPanelAria'))
    );
    setNodeAttr(
      '#rosary-modal-dots',
      'aria-label',
      readRosaryMessage('stepsAria')
    );
    setNodeText('#rosary-modal-prev', readRosaryMessage('prevButton'));
    setNodeText('#rosary-modal-next', readRosaryMessage('nextButton'));
    if (Array.isArray(content.misterios?.modal?.jaculatoryItems)) {
      const jaculatoryList = document.querySelector('#mystery-jaculatory-panel .mystery-jaculatory-list');
      if (jaculatoryList) {
        jaculatoryList.innerHTML = '';
        content.misterios.modal.jaculatoryItems.forEach((line) => {
          const lineNode = document.createElement('li');
          lineNode.textContent = line;
          jaculatoryList.appendChild(lineNode);
        });
      }
    }
  };

  applyPortalContentToDom(portalContent);
  let activeMenuLevel = menuRootLevel;

  const transitionMenuLevel = (fromLevel, toLevel) => {
    if (!fromLevel || !toLevel || fromLevel === toLevel) return;
    const fromContainsTo = fromLevel.contains(toLevel);

    toLevel.hidden = false;
    toLevel.setAttribute('aria-hidden', 'false');
    if (!fromContainsTo) {
      fromLevel.hidden = true;
      fromLevel.setAttribute('aria-hidden', 'true');
    }
  };

  const closeMenuDropdowns = () => {
    if (!menuList || !menuRootLevel) return;

    menuList.querySelectorAll('.dl-submenu').forEach((submenu) => {
      submenu.hidden = true;
      submenu.setAttribute('aria-hidden', 'true');
    });

    menuRootLevel.hidden = false;
    menuRootLevel.setAttribute('aria-hidden', 'false');
    activeMenuLevel = menuRootLevel;
    menuList.classList.remove('is-submenu-open');
    menuList.querySelectorAll('.menu-item-parent.is-submenu-open').forEach((item) => {
      item.classList.remove('is-submenu-open');
    });

    menuParentTriggers.forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
    });
  };

  const isCompactMenuViewport = () => window.innerWidth <= COMPACT_MENU_BREAKPOINT;

  const closeAuthDropdown = () => {
    if (!authMenu || !authMenuTrigger || !authMenuDropdown) return;
    authMenu.classList.remove('is-open');
    authMenuTrigger.setAttribute('aria-expanded', 'false');
    authMenuDropdown.hidden = true;
  };

  const openAuthDropdown = () => {
    if (!authMenu || !authMenuTrigger || !authMenuDropdown) return;
    authMenu.classList.add('is-open');
    authMenuTrigger.setAttribute('aria-expanded', 'true');
    authMenuDropdown.hidden = false;
  };

  const closeMainMenu = () => {
    if (!menuToggle || !menuList) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', readUiMessage('menu.openAria'));
    menuList.classList.remove('open');
    closeMenuDropdowns();
    closeAuthDropdown();
  };

  const syncHeaderHeight = () => {
    if (!siteHeader) return;
    document.documentElement.style.setProperty('--header-height', `${siteHeader.offsetHeight}px`);
  };
  const scrollToSectionWithHeaderOffset = (section, options = {}) => {
    if (!(section instanceof HTMLElement)) return;
    const { behavior = 'auto' } = options;
    syncHeaderHeight();
    const headerOffset = siteHeader ? siteHeader.offsetHeight : 0;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const sectionStyle = window.getComputedStyle(section);
    const sectionPaddingTop = Number.parseFloat(sectionStyle.paddingTop) || 0;

    let contentOffset = 0;
    if (section.matches('section[id]')) {
      const contentTarget = section.querySelector('.section-header, .hero-copy, .container > :first-child');
      if (contentTarget instanceof HTMLElement) {
        contentOffset = Math.max(
          0,
          contentTarget.getBoundingClientRect().top - section.getBoundingClientRect().top
        );
      } else {
        contentOffset = sectionPaddingTop;
      }
    }

    const targetTop = Math.max(0, sectionTop + contentOffset - headerOffset - ANCHOR_SCROLL_EXTRA_OFFSET);
    window.scrollTo({ top: targetTop, behavior });
  };

  const resolveCurrentHashId = () => {
    const rawHash = window.location.hash || '';
    if (!rawHash || rawHash.length <= 1) return null;
    const hashValue = rawHash.slice(1);
    let hashId = hashValue;
    try {
      hashId = decodeURIComponent(hashValue);
    } catch (err) {
      hashId = hashValue;
    }
    return hashId || null;
  };

  const resolveHashTargetElement = () => {
    const hashId = resolveCurrentHashId();
    return hashId ? document.getElementById(hashId) : null;
  };

  const replaceUrlHashForSection = (sectionId) => {
    const safeSectionId = String(sectionId || '').trim();
    if (!safeSectionId) return;
    if (resolveCurrentHashId() === safeSectionId) return;

    if (window.history.replaceState) {
      window.history.replaceState(null, '', `#${safeSectionId}`);
      return;
    }

    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    window.location.hash = safeSectionId;
    window.scrollTo(scrollX, scrollY);
  };

  const alignCurrentHashTarget = (options = {}) => {
    const { behavior = 'auto' } = options;
    const target = resolveHashTargetElement();
    if (!target) return false;
    const revealContainer = target instanceof HTMLElement
      ? (
        target.classList.contains('reveal')
          ? target
          : target.closest('.reveal')
      )
      : null;
    if (revealContainer instanceof HTMLElement) {
      // Avoid post-scroll jumps caused by reveal transform changing after anchor alignment.
      revealContainer.classList.add('is-visible');
    }
    scrollToSectionWithHeaderOffset(target, { behavior });
    setActiveSectionLink(target.id);
    return true;
  };

  const scheduleHashAlignmentPasses = (delays = [0, 90, 240]) => {
    delays.forEach((delay) => {
      window.setTimeout(() => {
        alignCurrentHashTarget({ behavior: 'auto' });
      }, delay);
    });
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
      scrollToSectionWithHeaderOffset(targetSection, { behavior });
    }

    if (updateHash) {
      replaceUrlHashForSection(targetSection.id);
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
    closeMenuDropdowns();

    menuParentTriggers.forEach((trigger) => {
      const parentItem = trigger.closest('.menu-item-parent');
      const submenu = parentItem ? parentItem.querySelector(':scope > .dl-submenu') : null;
      if (!submenu) return;

      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      submenu.hidden = true;
      submenu.setAttribute('aria-hidden', 'true');

      trigger.addEventListener('click', () => {
        if (!menuList.classList.contains('open')) return;
        const fromLevel = activeMenuLevel || menuRootLevel;
        if (!fromLevel || fromLevel === submenu) return;
        const activeParentItem = parentItem instanceof HTMLElement ? parentItem : null;
        if (activeParentItem) {
          menuList.classList.add('is-submenu-open');
          menuList.querySelectorAll('.menu-item-parent.is-submenu-open').forEach((item) => {
            if (item !== activeParentItem) {
              item.classList.remove('is-submenu-open');
            }
          });
          activeParentItem.classList.add('is-submenu-open');
        }

        menuParentTriggers.forEach((itemTrigger) => {
          if (itemTrigger !== trigger) {
            itemTrigger.setAttribute('aria-expanded', 'false');
          }
        });
        trigger.setAttribute('aria-expanded', 'true');
        activeMenuLevel = submenu;
        transitionMenuLevel(fromLevel, submenu);
      });
    });

    menuBackTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        if (!menuList.classList.contains('open')) return;
        const currentLevel = trigger.closest('.dl-submenu');
        if (!currentLevel) return;

        const parentItem = currentLevel.parentElement;
        if (!(parentItem instanceof HTMLElement)) return;
        const parentTrigger = parentItem.querySelector(':scope > .menu-parent-trigger');
        if (parentTrigger) {
          parentTrigger.setAttribute('aria-expanded', 'false');
        }
        parentItem.classList.remove('is-submenu-open');
        menuList.classList.remove('is-submenu-open');

        const parentLevel = parentItem.parentElement;
        if (!(parentLevel instanceof HTMLElement)) return;
        activeMenuLevel = parentLevel;
        transitionMenuLevel(currentLevel, parentLevel);
      });
    });

    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      const nextState = !expanded;
      menuToggle.setAttribute('aria-expanded', String(nextState));
      menuToggle.setAttribute(
        'aria-label',
        nextState
          ? readUiMessage('menu.closeAria')
          : readUiMessage('menu.openAria')
      );
      if (nextState) {
        closeMenuDropdowns();
        closeAuthDropdown();
      }
      menuList.classList.toggle('open', nextState);
      if (!nextState) closeMainMenu();
    });

    if (menuCloseButtons.length) {
      menuCloseButtons.forEach((button) => {
        button.addEventListener('click', () => {
          closeMainMenu();
        });
      });
    }

    menuList.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMainMenu());
    });

    document.addEventListener('click', (event) => {
      const isInsideMenu = (
        menuList.contains(event.target)
        || menuToggle.contains(event.target)
        || (authMenu && authMenu.contains(event.target))
      );
      if (!isInsideMenu) {
        closeMainMenu();
      }
    });
  }

  if (authMenu && authMenuTrigger && authMenuDropdown) {
    closeAuthDropdown();

    authMenuTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isExpanded = authMenuTrigger.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeAuthDropdown();
        return;
      }
      closeMainMenu();
      openAuthDropdown();
    });

    authMenuDropdown.addEventListener('click', (event) => {
      const targetButton = event.target instanceof Element
        ? event.target.closest('[data-auth-action]')
        : null;
      if (!targetButton) return;
      closeAuthDropdown();
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
      themeToggleBtn.setAttribute(
        'aria-label',
        isDark
          ? readUiMessage('theme.enableLight')
          : readUiMessage('theme.enableDark')
      );
      themeToggleBtn.setAttribute(
        'title',
        isDark
          ? readUiMessage('theme.darkActive')
          : readUiMessage('theme.lightActive')
      );
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

  // Keep mobile-like flow on all viewports to avoid losing context while scrolling long content.
  const portalModeEnabled = false;
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
      if (link.hasAttribute('data-open-rosary-modal')) return;
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#') || href.length <= 1) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;

      if (portalModeEnabled) {
        event.preventDefault();
        setPortalActiveSection(target.id, { updateHash: true, behavior: 'auto' });
      } else {
        event.preventDefault();
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth';
        scrollToSectionWithHeaderOffset(target, { behavior });
        setActiveSectionLink(target.id);
        if (window.history.pushState) {
          window.history.pushState(null, '', `#${target.id}`);
        } else {
          window.location.hash = target.id;
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
    replaceUrlHashForSection(nearestSectionId);
  };

  const scheduleSectionSync = () => {
    if (navSyncFrame !== null) return;
    navSyncFrame = window.requestAnimationFrame(syncCurrentSectionByScroll);
  };

  if (mainElement) {
    mainElement.addEventListener('scroll', scheduleSectionSync, { passive: true });
    mainElement.addEventListener('wheel', (event) => {
      if (isSongSaveLocationPickerOpen()) {
        event.preventDefault();
        return;
      }
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
      if (isSongSaveLocationPickerOpen()) {
        touchStartY = null;
        touchStartSectionScrollTop = 0;
        return;
      }
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
      if (isSongSaveLocationPickerOpen()) {
        touchStartY = null;
        touchStartSectionScrollTop = 0;
        return;
      }
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
  if ('ResizeObserver' in window && siteHeader) {
    const headerResizeObserver = new ResizeObserver(() => {
      syncHeaderHeight();
      if (!portalModeEnabled && window.location.hash) {
        alignCurrentHashTarget({ behavior: 'auto' });
      }
      if (!portalModeEnabled) {
        scheduleSectionSync();
      }
    });
    headerResizeObserver.observe(siteHeader);
  }
  window.addEventListener('touchstart', (event) => {
    if (!document.body.classList.contains('landscape-mobile')) return;
    const hasOpenModal = Boolean(document.querySelector('.mystery-modal.open, .mystery-group-modal.open, .rosary-modal.open, .song-modal.open, .song-share-modal.open, .song-share-merge-modal.open, .auth-modal.open, .auth-sessions-modal.open, .favorite-confirm-modal.open, .custom-song-modal.open, .mystery-song-assign-modal.open'));
    if (hasOpenModal) return;
    const touchTarget = event.target;
    if (touchTarget instanceof Element) {
      const isInteractive = touchTarget.closest(
        'a, button, input, textarea, select, label, [role="button"]'
      );
      if (isInteractive) return;
    }
    attemptHideMobileBrowserBars();
  }, { passive: true });

  const initialHashTarget = resolveHashTargetElement();
  if (initialHashTarget) {
    scheduleHashAlignmentPasses();
    window.requestAnimationFrame(() => {
      if (portalModeEnabled) {
        setPortalActiveSection(initialHashTarget.id, { updateHash: true, behavior: 'auto' });
      } else {
        alignCurrentHashTarget({ behavior: 'auto' });
      }
    });
  } else if (pageSections.length) {
    if (portalModeEnabled) {
      setPortalActiveSection(pageSections[0].id, { updateHash: false, behavior: 'auto' });
    } else {
      setActiveSectionLink(pageSections[0].id);
    }
  }

  window.addEventListener('hashchange', () => {
    const target = resolveHashTargetElement();
    if (!target) return;

    if (portalModeEnabled) {
      setPortalActiveSection(target.id, { updateHash: false, behavior: 'auto' });
    } else {
      scrollToSectionWithHeaderOffset(target, { behavior: 'auto' });
      setActiveSectionLink(target.id);
    }
  });

  window.addEventListener('load', () => {
    alignCurrentHashTarget({ behavior: 'auto' });
    scheduleHashAlignmentPasses([120, 280]);
  });
  window.addEventListener('pageshow', () => {
    alignCurrentHashTarget({ behavior: 'auto' });
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
    const hasEmbedSrc = Boolean((youtubeEmbed.getAttribute('src') || '').trim());
    if (!hasEmbedSrc) {
      youtubeEmbed.hidden = true;
      youtubeEmbed.setAttribute('aria-hidden', 'true');
      showVideoFallback();
    }

    if (window.location.protocol === 'file:') {
      showVideoFallback();
    }

    if (hasEmbedSrc) {
      youtubeEmbed.addEventListener('error', showVideoFallback);

      window.addEventListener('message', (event) => {
        try {
          const hostname = new URL(event.origin).hostname;
          const isYoutubeOrigin = hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com');
          if (!isYoutubeOrigin) return;

          const payload = typeof event.data === 'string'
            ? event.data
            : (
              event.data && typeof event.data === 'object'
                ? JSON.stringify(event.data)
                : ''
            );
          if (
            typeof payload === 'string'
            && (
              payload.includes('"error":153')
              || payload.includes('"errorCode":153')
            )
          ) {
            showVideoFallback();
          }
        } catch (err) {
          return;
        }
      });
    }
  }

  const storyData = (
    portalContent?.historia?.stories && typeof portalContent.historia.stories === 'object'
      ? portalContent.historia.stories
      : {}
  );

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

  const mysteryByDay = (
    portalContent?.misterios?.byDay && typeof portalContent.misterios.byDay === 'object'
      ? portalContent.misterios.byDay
      : {}
  );
  const mysteryMeditations = (
    portalContent?.misterios?.meditations && typeof portalContent.misterios.meditations === 'object'
      ? portalContent.misterios.meditations
      : {}
  );

  const mysteryModal = document.getElementById('mystery-modal');
  const mysteryModalLinks = document.getElementById('mystery-modal-links');
  const mysteryModalTitle = document.getElementById('mystery-modal-title');
  const mysteryModalText = document.getElementById('mystery-modal-text');
  const mysteryModalGroup = document.getElementById('mystery-modal-group');
  const mysteryGroupModal = document.getElementById('mystery-group-modal');
  const mysteryGroupModalOptions = document.getElementById('mystery-group-modal-options');
  const mysteryGroupModalCloseButtons = document.querySelectorAll('[data-mystery-group-modal-close]');
  const mysteryModalSongToggle = document.getElementById('mystery-modal-song-toggle');
  const mysteryModalSongPanel = document.getElementById('mystery-modal-song-panel');
  const mysteryModalSongTitle = document.getElementById('mystery-modal-song-title');
  const mysteryModalSongClose = document.getElementById('mystery-modal-song-close');
  const mysteryModalSongLyrics = document.getElementById('mystery-modal-song-lyrics');
  const mysteryAveMariaOptions = document.getElementById('mystery-ave-maria-options');
  const mysteryJaculatoryToggle = document.getElementById('mystery-jaculatory-toggle');
  const mysteryJaculatoryPanel = document.getElementById('mystery-jaculatory-panel');
  const mysteryJaculatoryClose = document.getElementById('mystery-jaculatory-close');
  const mysteryModalCloseButtons = document.querySelectorAll('[data-mystery-modal-close]');
  const rosaryModal = document.getElementById('rosary-modal');
  const rosaryModalTitle = document.getElementById('rosary-modal-title');
  const rosaryModalGroup = document.getElementById('rosary-modal-group');
  const rosaryModalStepText = document.getElementById('rosary-modal-step-text');
  const rosaryModalDots = document.getElementById('rosary-modal-dots');
  const rosaryModalSongToggle = document.getElementById('rosary-modal-song-toggle');
  const rosaryModalSongPanel = document.getElementById('rosary-modal-song-panel');
  const rosaryModalSongTitle = document.getElementById('rosary-modal-song-title');
  const rosaryModalSongMeta = document.getElementById('rosary-modal-song-meta');
  const rosaryModalSongExternalActions = document.getElementById('rosary-modal-song-external-actions');
  const rosaryModalSongSpotifyLink = document.getElementById('rosary-modal-song-spotify-link');
  const rosaryModalSongYoutubeLink = document.getElementById('rosary-modal-song-youtube-link');
  const rosaryModalSongClose = document.getElementById('rosary-modal-song-close');
  const rosaryModalSongLyrics = document.getElementById('rosary-modal-song-lyrics');
  const rosaryModalStepCounter = document.getElementById('rosary-modal-step-counter');
  const rosaryModalPrevBtn = document.getElementById('rosary-modal-prev');
  const rosaryModalNextBtn = document.getElementById('rosary-modal-next');
  const rosaryModalCloseButtons = document.querySelectorAll('[data-rosary-modal-close]');
  const rosaryModalTriggers = document.querySelectorAll('[data-open-rosary-modal]');
  const mysterySongAssignModal = document.getElementById('mystery-song-assign-modal');
  const mysterySongAssignSong = document.getElementById('mystery-song-assign-song');
  const mysterySongAssignList = document.getElementById('mystery-song-assign-list');
  const mysterySongAssignCloseButtons = document.querySelectorAll('[data-mystery-song-assign-close]');
  const songSaveLocationPicker = document.getElementById('song-save-location-picker');
  const songSaveLocationPickerBreadcrumb = document.getElementById('song-save-location-picker-breadcrumb');
  const songSaveLocationPickerSong = document.getElementById('song-save-location-picker-song');
  const songSaveLocationPickerSearchInput = document.getElementById('song-save-location-picker-search');
  const songSaveLocationPickerBackBtn = document.getElementById('song-save-location-picker-back');
  const songSaveLocationPickerAddBtn = document.getElementById('song-save-location-picker-add');
  const songSaveLocationPickerCloseBtn = document.getElementById('song-save-location-picker-close');
  const songSaveLocationPickerList = document.getElementById('song-save-location-picker-list');
  const songLocationCreateModal = document.getElementById('song-location-create-modal');
  const songLocationCreateTitle = document.getElementById('song-location-create-title');
  const songLocationCreateTargetHint = document.getElementById('song-location-create-target-hint');
  const songLocationCreateParentInput = document.getElementById('song-location-create-parent');
  const songLocationCreateParentPicker = document.getElementById('song-location-create-parent-picker');
  const songLocationCreateParentEmpty = document.getElementById('song-location-create-parent-empty');
  const songLocationCreateParentTree = document.getElementById('song-location-create-parent-tree');
  const songLocationCreateParentIdInput = document.getElementById('song-location-create-parent-id');
  const songLocationCreateHint = document.getElementById('song-location-create-hint');
  const songLocationCreateInput = document.getElementById('song-location-create-input');
  const songLocationCreateCancelBtn = document.getElementById('song-location-create-cancel');
  const songLocationCreateAcceptBtn = document.getElementById('song-location-create-accept');
  const songLocationCreateCloseButtons = document.querySelectorAll('[data-song-location-create-close]');
  let lastFocusedMystery = null;
  let lastFocusedMysterySongAssignTrigger = null;
  let mysterySongAssignPendingSong = null;
  let songSaveLocationPickerPendingSong = null;
  let songSaveLocationPickerAnchor = null;
  let songSaveLocationPickerAnchorRect = null;
  let songSaveLocationPickerFocusTarget = null;
  let songSaveLocationPickerPointer = null;
  let songSaveLocationPickerPath = [];
  let songSaveLocationPickerBaseDepth = 0;
  let songSaveLocationPickerSearchQuery = '';
  let songLocationCreateModalParentId = '';
  let songLocationCreateModalParentLabel = '';
  let songLocationCreateParentEntries = [];
  let songLocationCreateParentNodes = [];
  let songLocationCreateModalFocusTarget = null;
  let songLocationCreateModalSubmitting = false;
  let lastFocusedRosaryTrigger = null;
  let rosaryModalStepIndex = 0;
  let rosaryModalSongLoading = false;
  const songSaveLocationPickerTextMeasureContext = (() => {
    const canvas = document.createElement('canvas');
    return canvas.getContext('2d');
  })();

  const ensureMysteryNavBeforeTitle = () => {
    if (!mysteryModalLinks) return;
    const headingNode = mysteryModal?.querySelector('.mystery-modal-heading');
    if (!headingNode || mysteryModalLinks.nextElementSibling === headingNode) return;
    headingNode.insertAdjacentElement('beforebegin', mysteryModalLinks);
  };
  ensureMysteryNavBeforeTitle();

  const mysteryItemsByGroup = Object.values(mysteryByDay).reduce((acc, slot) => {
    if (!acc[slot.title]) {
      acc[slot.title] = slot.items.slice();
    }
    return acc;
  }, {});
  const normalizePrayerLookupToken = (value) => (
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  );
  const readPrayerTextByTitle = (title) => {
    const targetToken = normalizePrayerLookupToken(title);
    if (!targetToken) return '';
    const prayerItems = Array.isArray(portalContent?.oracoes?.items)
      ? portalContent.oracoes.items
      : (Array.isArray(portalContent?.oracoes?.cards) ? portalContent.oracoes.cards : []);
    for (const prayerItem of prayerItems) {
      const titleToken = normalizePrayerLookupToken(prayerItem?.title);
      if (titleToken !== targetToken) continue;
      const text = String(prayerItem?.text || '').trim();
      if (text) return text;
    }
    return '';
  };
  const buildRosaryStartStepFallbackText = () => {
    const holySpiritPrayerTitle = readRosaryMessage('holySpiritPrayerTitle');
    const holySpiritText = readPrayerTextByTitle(holySpiritPrayerTitle);
    return [readRosaryMessage('stepStartSignOfCrossText'), holySpiritText].filter(Boolean).join('\n\n');
  };
  const buildRosaryFinalStepFallbackText = () => {
    const thanksgivingPrayerTitle = readRosaryMessage('thanksgivingPrayerTitle');
    const salveRainhaPrayerTitle = readRosaryMessage('salveRainhaPrayerTitle');
    const thanksgivingText = readPrayerTextByTitle(thanksgivingPrayerTitle);
    const salveRainhaText = readPrayerTextByTitle(salveRainhaPrayerTitle);
    return [thanksgivingText, salveRainhaText].filter(Boolean).join('\n\n');
  };
  const buildRosarySongLocationPath = (groupLabel) => {
    const rootLabel = readRosaryMessage('songCategoryLabel', 'Terço');
    const safeRootLabel = String(rootLabel || '').trim();
    const safeGroupLabel = String(groupLabel || '').trim();
    return [safeRootLabel, safeGroupLabel].filter(Boolean);
  };
  const rosaryFlowSteps = [
    {
      group: readRosaryMessage('stepStartGroup'),
      title: readRosaryMessage('stepStartTitle'),
      text: readRosaryMessage('stepStartText', buildRosaryStartStepFallbackText()),
      dotNumber: readRosaryMessage('dotStartNumber'),
      dotLabel: readRosaryMessage('dotStart'),
      songLocationPath: buildRosarySongLocationPath(readRosaryMessage('stepStartGroup')),
    },
    {
      group: readRosaryMessage('stepInitialBeadsGroup'),
      title: readRosaryMessage('stepInitialBlockTitle'),
      hideTitle: true,
      text: readRosaryMessage('stepInitialBlockText'),
      dotNumber: readRosaryMessage('dotInitialBlockNumber'),
      dotLabel: readRosaryMessage('dotInitialBlock'),
      songLocationPath: buildRosarySongLocationPath(readRosaryMessage('stepInitialBeadsGroup')),
    },
    {
      group: readRosaryMessage('stepMysteriesGroup'),
      title: readRosaryMessage('stepMysteriesTitle'),
      text: readRosaryMessage('stepMysteriesText'),
      actionType: 'open_today_mysteries',
      actionLabel: readRosaryMessage('openMysteriesButton'),
      dotNumber: readRosaryMessage('dotMysteriesNumber'),
      dotLabel: readRosaryMessage('dotMysteries'),
    },
    {
      group: readRosaryMessage('stepFinalGroup'),
      title: readRosaryMessage('stepFinalTitle'),
      text: readRosaryMessage('stepFinalText', buildRosaryFinalStepFallbackText()),
      dotNumber: readRosaryMessage('dotFinalNumber'),
      dotLabel: readRosaryMessage('dotFinal'),
      songLocationPath: buildRosarySongLocationPath(readRosaryMessage('stepFinalGroup')),
    },
  ];
  const resolveTodayMysterySlot = () => {
    const slot = mysteryByDay[new Date().getDay()];
    return slot && typeof slot === 'object' ? slot : null;
  };
  const normalizeMysteryName = (value) => (
    String(value || '')
      .trim()
      .replace(/^\d+\s*[ºo]\s+/i, '')
      .replace(/\s+/g, ' ')
  );
  const normalizeKeyToken = (value) => (
    normalizeMysteryName(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  );
  const canonicalMysteryGroupKey = (value) => (
    normalizeKeyToken(value)
      .replace(/\bmisterios?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const buildMysterySongAssignmentKey = (groupTitle, mysteryTitle) => (
    `${canonicalMysteryGroupKey(groupTitle)}|${normalizeKeyToken(mysteryTitle)}`
  );
  const normalizeMysterySongAssignmentPayload = (raw) => {
    const payload = asObject(raw);
    return {
      assignmentKey: String(payload.assignment_key || payload.assignmentKey || '').trim(),
      groupTitle: String(payload.group_title || payload.groupTitle || '').trim(),
      groupDay: String(payload.group_day || payload.groupDay || '').trim(),
      mysteryTitle: normalizeMysteryName(payload.mystery_title || payload.mysteryTitle || ''),
      songTitle: String(payload.song_title || payload.songTitle || '').trim(),
      songArtist: String(payload.song_artist || payload.songArtist || '').trim(),
      songUrl: String(payload.song_url || payload.songUrl || '').trim(),
      source: String(payload.source || '').trim(),
      sourceLabel: String(payload.source_label || payload.sourceLabel || '').trim(),
      imageUrl: String(payload.image_url || payload.imageUrl || '').trim(),
      lyricsText: String(payload.lyrics_text || payload.lyricsText || ''),
      lyricsSource: String(payload.lyrics_source || payload.lyricsSource || '').trim(),
      lyricsSourceUrl: String(payload.lyrics_source_url || payload.lyricsSourceUrl || '').trim(),
      createdAtUtc: String(payload.created_at_utc || payload.createdAtUtc || '').trim(),
      updatedAtUtc: String(payload.updated_at_utc || payload.updatedAtUtc || '').trim(),
    };
  };
  const parseMysterySongAssignmentApiError = (payload, fallbackMessage) => (
    payload?.detail?.message
    || payload?.message
    || fallbackMessage
  );
  const mysteryCardsConfig = Array.isArray(portalContent?.misterios?.cards)
    ? portalContent.misterios.cards
    : [];
  const mysterySongGroupsCatalog = mysteryCardsConfig
    .map((card) => {
      const safeCard = asObject(card);
      const groupTitle = String(safeCard.title || '').trim();
      const groupDay = String(safeCard.day || '').trim();
      const items = Array.isArray(safeCard.items)
        ? safeCard.items.map((item) => normalizeMysteryName(item)).filter(Boolean)
        : [];
      if (!groupTitle || !items.length) return null;
      return {
        key: canonicalMysteryGroupKey(groupTitle),
        title: groupTitle,
        day: groupDay,
        items,
      };
    })
    .filter(Boolean);
  let mysterySongAssignments = {};
  let mysterySongAssignmentsLoading = false;
  let currentMysteryModalSelection = { title: '', group: '' };
  let mysteryAveMariaCurrent = 0;
  let mysteryAveMariaAutoJaculatoryTimerId = null;
  const MYSTERY_AVE_MARIA_AUTO_JACULATORY_DELAY_MS = 15000;
  let mysteryModalSongLoading = false;
  let songLocationTreeRoots = [];
  let songLocationTreeLoading = false;
  let songLocationAssignments = {};
  let songLocationAssignmentsLoading = false;

  const normalizeSongLocationNodePayload = (rawPayload) => {
    const payload = asObject(rawPayload);
    const nodeId = String(payload.node_id || payload.nodeId || payload.id || '').trim();
    const parentId = String(payload.parent_id || payload.parentId || '').trim();
    const label = String(payload.label || '').trim();
    const assignmentMode = String(payload.assignment_mode || payload.assignmentMode || 'location').trim().toLowerCase() === 'mystery'
      ? 'mystery'
      : 'location';
    const mysteryGroupTitle = String(payload.mystery_group_title || payload.mysteryGroupTitle || '').trim();
    const mysteryTitle = normalizeMysteryName(payload.mystery_title || payload.mysteryTitle || '');
    const rawChildren = Array.isArray(payload.children) ? payload.children : [];
    const children = rawChildren
      .map((child) => normalizeSongLocationNodePayload(child))
      .filter((child) => Boolean(child.id && child.label));
    const parsedOrderIndex = Number.parseInt(String(payload.order_index ?? payload.orderIndex ?? ''), 10);
    const rawIsActive = Object.prototype.hasOwnProperty.call(payload, 'is_active')
      ? payload.is_active
      : payload.isActive;
    const normalizedIsActiveToken = String(rawIsActive ?? '').trim().toLowerCase();
    return {
      id: nodeId,
      parentId,
      label,
      orderIndex: Number.isInteger(parsedOrderIndex) && parsedOrderIndex > 0 ? parsedOrderIndex : 0,
      assignmentMode,
      mysteryGroupTitle,
      mysteryTitle,
      isActive: !(
        rawIsActive === false
        || rawIsActive === 0
        || normalizedIsActiveToken === 'false'
        || normalizedIsActiveToken === '0'
        || normalizedIsActiveToken === 'no'
        || normalizedIsActiveToken === 'off'
        || normalizedIsActiveToken === 'inativo'
      ),
      deletedAtUtc: String(payload.deleted_at_utc || payload.deletedAtUtc || '').trim(),
      children,
    };
  };

  const normalizeSongLocationAssignmentPayload = (rawPayload) => {
    const payload = asObject(rawPayload);
    const rawPath = Array.isArray(payload.location_path)
      ? payload.location_path
      : (Array.isArray(payload.locationPath) ? payload.locationPath : []);
    return {
      assignmentKey: String(payload.assignment_key || payload.assignmentKey || payload.location_id || payload.locationId || '').trim(),
      locationId: String(payload.location_id || payload.locationId || '').trim(),
      locationLabel: String(payload.location_label || payload.locationLabel || '').trim(),
      locationPath: rawPath.map((item) => String(item || '').trim()).filter(Boolean),
      songTitle: String(payload.song_title || payload.songTitle || '').trim(),
      songArtist: String(payload.song_artist || payload.songArtist || '').trim(),
      songUrl: String(payload.song_url || payload.songUrl || '').trim(),
      source: String(payload.source || '').trim(),
      sourceLabel: String(payload.source_label || payload.sourceLabel || '').trim(),
      imageUrl: String(payload.image_url || payload.imageUrl || '').trim(),
      lyricsText: String(payload.lyrics_text || payload.lyricsText || ''),
      lyricsSource: String(payload.lyrics_source || payload.lyricsSource || '').trim(),
      lyricsSourceUrl: String(payload.lyrics_source_url || payload.lyricsSourceUrl || '').trim(),
      createdAtUtc: String(payload.created_at_utc || payload.createdAtUtc || '').trim(),
      updatedAtUtc: String(payload.updated_at_utc || payload.updatedAtUtc || '').trim(),
    };
  };

  const getSongLocationAssignment = (locationId) => {
    const safeLocationId = String(locationId || '').trim();
    if (!safeLocationId) return {};
    return asObject(songLocationAssignments[safeLocationId]);
  };

  const getMysterySongAssignment = (groupTitle, mysteryTitle) => {
    const key = buildMysterySongAssignmentKey(groupTitle, mysteryTitle);
    return asObject(mysterySongAssignments[key]);
  };

  const buildSongPayloadFromFavorite = (favoritePayload) => {
    const favorite = asObject(favoritePayload);
    return {
      title: String(favorite.title || favorite.songTitle || '').trim(),
      artist: String(favorite.artist || favorite.songArtist || '').trim(),
      url: String(favorite.url || favorite.songUrl || '').trim(),
      source: String(favorite.source || '').trim(),
      source_label: String(favorite.sourceLabel || favorite.source_label || '').trim(),
      image_url: String(favorite.imageUrl || favorite.image_url || '').trim(),
    };
  };

  const resolveMysteryItemLabel = (groupTitle, mysteryTitle) => {
    const normalizedMysteryTitle = normalizeMysteryName(mysteryTitle);
    if (!normalizedMysteryTitle) return '';
    const groupItems = resolveMysteryGroupItems(groupTitle);
    if (Array.isArray(groupItems) && groupItems.length) {
      const targetKey = normalizeKeyToken(normalizedMysteryTitle);
      const foundIndex = groupItems.findIndex((itemTitle) => normalizeKeyToken(itemTitle) === targetKey);
      if (foundIndex >= 0) {
        return formatMysteryItemLabel(groupItems[foundIndex], foundIndex);
      }
    }
    return normalizedMysteryTitle;
  };

  const readSongIdentityForMatch = (songPayload) => {
    const song = asObject(songPayload);
    return {
      urlKey: normalizeSongUrlKey(song.url || song.songUrl || song.song_url || ''),
      titleArtistKey: normalizeSongTitleArtistKey(
        song.title || song.songTitle || song.song_title || '',
        song.artist || song.songArtist || song.song_artist || ''
      ),
      titleKey: normalizeSongMatchToken(song.title || song.songTitle || song.song_title || ''),
    };
  };

  const isSongIdentityMatch = (songIdentity, targetIdentity) => {
    const safeSongIdentity = asObject(songIdentity);
    const safeTargetIdentity = asObject(targetIdentity);
    const matchedByUrl = Boolean(
      safeSongIdentity.urlKey
      && safeTargetIdentity.urlKey
      && safeSongIdentity.urlKey === safeTargetIdentity.urlKey
    );
    if (matchedByUrl) return true;

    const matchedByTitleArtist = Boolean(
      safeSongIdentity.titleArtistKey
      && safeTargetIdentity.titleArtistKey
      && safeSongIdentity.titleArtistKey === safeTargetIdentity.titleArtistKey
    );
    if (matchedByTitleArtist) return true;

    return Boolean(
      safeSongIdentity.titleKey
      && safeTargetIdentity.titleKey
      && safeSongIdentity.titleKey === safeTargetIdentity.titleKey
    );
  };
  const buildUsageLabelDedupKey = (value) => {
    const segments = String(value || '')
      .split('>')
      .map((segment) => normalizeKeyToken(String(segment || '').trim()))
      .filter(Boolean);
    return segments.join(' > ');
  };

  const normalizeUsageLabelForDisplay = (value) => {
    const segments = String(value || '')
      .split('>')
      .map((segment) => String(segment || '').trim())
      .filter(Boolean);
    if (!segments.length) return '';

    const rootLabel = String(readMysteryMessage('assignCategoryMystery') || '').trim();
    if (!rootLabel || segments.length < 2) {
      return segments.join(' > ');
    }

    const rootToken = normalizeKeyToken(rootLabel);
    const firstToken = normalizeKeyToken(segments[0]);
    if (!firstToken || firstToken === rootToken) {
      return segments.join(' > ');
    }

    const knownMysteryGroupTokens = new Set();
    mysterySongGroupsCatalog.forEach((group) => {
      const groupKey = canonicalMysteryGroupKey(group.title || '');
      if (!groupKey) return;
      knownMysteryGroupTokens.add(groupKey);
      const simplifiedKey = groupKey.replace(/^misterios?\s+/i, '').trim();
      if (simplifiedKey) {
        knownMysteryGroupTokens.add(simplifiedKey);
      }
    });

    if (!knownMysteryGroupTokens.has(firstToken)) {
      return segments.join(' > ');
    }

    return [rootLabel, ...segments].join(' > ');
  };

  const dedupeUsageLabels = (values) => {
    const labels = [];
    const seen = new Set();
    const rows = Array.isArray(values) ? values : [];
    rows.forEach((rawValue) => {
      const label = normalizeUsageLabelForDisplay(rawValue);
      if (!label) return;
      const dedupKey = buildUsageLabelDedupKey(label);
      if (!dedupKey || seen.has(dedupKey)) return;
      seen.add(dedupKey);
      labels.push(label);
    });
    labels.sort((labelA, labelB) => labelA.localeCompare(labelB, 'pt-BR', { sensitivity: 'base' }));
    return labels;
  };

  const resolveSongMysteryUsageLabels = (songPayload) => {
    const songIdentity = readSongIdentityForMatch(songPayload);
    const assignmentRows = Object.values(asObject(mysterySongAssignments));
    if (!assignmentRows.length) return [];

    const mysteryRootLabel = String(readMysteryMessage('assignCategoryMystery') || '').trim();
    const labels = [];
    assignmentRows.forEach((assignmentPayload) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      if (!isSongIdentityMatch(songIdentity, assignmentIdentity)) return;

      const groupTitle = String(assignment.groupTitle || assignment.group_title || '').trim();
      const mysteryTitle = normalizeMysteryName(assignment.mysteryTitle || assignment.mystery_title || '');
      if (!groupTitle || !mysteryTitle) return;

      const itemLabel = resolveMysteryItemLabel(groupTitle, mysteryTitle);
      const groupPath = mysteryRootLabel
        ? `${mysteryRootLabel} > ${groupTitle}`
        : groupTitle;
      const usageLabel = itemLabel ? `${groupPath} > ${itemLabel}` : groupPath;
      labels.push(usageLabel);
    });

    return dedupeUsageLabels(labels);
  };

  const hasSongMysteryUsage = (songPayload) => {
    const songIdentity = readSongIdentityForMatch(songPayload);
    const assignmentRows = Object.values(asObject(mysterySongAssignments));
    const mysteryMatch = assignmentRows.some((assignmentPayload) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      return isSongIdentityMatch(songIdentity, assignmentIdentity);
    });
    if (mysteryMatch) return true;

    const locationRows = Object.values(asObject(songLocationAssignments));
    return locationRows.some((assignmentPayload) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      return isSongIdentityMatch(songIdentity, assignmentIdentity);
    });
  };

  const resolveSongLocationPathById = (rawLocationId) => {
    const locationId = String(rawLocationId || '')
      .trim()
      .replace(/^location:/i, '')
      .trim();
    if (!locationId) return [];
    if (!Array.isArray(songLocationTreeRoots) || !songLocationTreeRoots.length) return [];

    const walkNodes = (nodes, parentPath = []) => {
      if (!Array.isArray(nodes)) return [];

      for (const rawNode of nodes) {
        const node = asObject(rawNode);
        const nodeId = String(node.id || node.nodeId || '')
          .trim()
          .replace(/^location:/i, '')
          .trim();
        const nodeLabel = String(node.label || node.locationLabel || '').trim();
        const nextPath = nodeLabel ? [...parentPath, nodeLabel] : [...parentPath];

        if (nodeId === locationId) {
          return nextPath.filter(Boolean);
        }

        const foundPath = walkNodes(node.children, nextPath);
        if (foundPath.length) {
          return foundPath;
        }
      }

      return [];
    };

    return walkNodes(songLocationTreeRoots, []);
  };

  const resolveSongLocationUsageLabels = (songPayload) => {
    const songIdentity = readSongIdentityForMatch(songPayload);
    const assignmentRows = Object.values(asObject(songLocationAssignments));
    if (!assignmentRows.length) return [];

    const labels = [];
    assignmentRows.forEach((assignmentPayload) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      if (!isSongIdentityMatch(songIdentity, assignmentIdentity)) return;

      const locationId = String(assignment.locationId || assignment.location_id || '')
        .trim()
        .replace(/^location:/i, '')
        .trim();
      let path = Array.isArray(assignment.locationPath)
        ? assignment.locationPath.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      if (!path.length && locationId) {
        path = resolveSongLocationPathById(locationId);
      }
      const locationLabel = String(assignment.locationLabel || '').trim();
      const usageLabel = path.length
        ? path.join(' > ')
        : locationLabel;
      labels.push(usageLabel);
    });

    return dedupeUsageLabels(labels);
  };

  const normalizeLocationPathSegments = (pathSegments) => (
    (Array.isArray(pathSegments) ? pathSegments : [])
      .map((segment) => String(segment || '').trim())
      .filter(Boolean)
  );

  const resolveSongLocationNodeByPath = (pathSegments) => {
    const normalizedPath = normalizeLocationPathSegments(pathSegments);
    if (!normalizedPath.length || !Array.isArray(songLocationTreeRoots) || !songLocationTreeRoots.length) {
      return null;
    }

    let nodeCursor = null;
    let nodeLevel = songLocationTreeRoots;
    for (const segment of normalizedPath) {
      const targetToken = normalizeKeyToken(segment);
      if (!targetToken) return null;
      const matchedNode = (Array.isArray(nodeLevel) ? nodeLevel : []).find((rawNode) => {
        const node = asObject(rawNode);
        return normalizeKeyToken(node.label || '') === targetToken;
      });
      if (!matchedNode) return null;
      nodeCursor = asObject(matchedNode);
      nodeLevel = Array.isArray(nodeCursor.children) ? nodeCursor.children : [];
    }
    return nodeCursor;
  };

  const resolveRosaryStepSongTarget = (stepPayload = null) => {
    const step = asObject(stepPayload || getRosaryFlowStep() || {});
    const locationPath = normalizeLocationPathSegments(step.songLocationPath);
    if (!locationPath.length) return null;

    const locationNode = resolveSongLocationNodeByPath(locationPath);
    if (!locationNode) {
      return {
        locationId: '',
        locationLabel: locationPath[locationPath.length - 1] || '',
        locationPath,
      };
    }

    const locationId = String(locationNode.id || locationNode.nodeId || '').trim().replace(/^location:/i, '').trim();
    return {
      locationId,
      locationLabel: String(locationNode.label || locationPath[locationPath.length - 1] || '').trim(),
      locationPath,
    };
  };

  const getRosaryStepSongAssignment = (stepPayload = null) => {
    const target = resolveRosaryStepSongTarget(stepPayload);
    if (!target || !target.locationId) return {};
    return getSongLocationAssignment(target.locationId);
  };

  const cacheMysterySongAssignment = (payload) => {
    const normalized = normalizeMysterySongAssignmentPayload(payload);
    const groupTitle = normalized.groupTitle;
    const mysteryTitle = normalized.mysteryTitle;
    if (!groupTitle || !mysteryTitle) return null;
    const assignmentKey = buildMysterySongAssignmentKey(groupTitle, mysteryTitle);
    mysterySongAssignments[assignmentKey] = {
      ...asObject(mysterySongAssignments[assignmentKey]),
      ...normalized,
      groupTitle,
      mysteryTitle,
    };
    return asObject(mysterySongAssignments[assignmentKey]);
  };

  const removeCachedMysterySongAssignment = (groupTitle, mysteryTitle) => {
    const safeGroupTitle = String(groupTitle || '').trim();
    const safeMysteryTitle = normalizeMysteryName(mysteryTitle);
    if (!safeGroupTitle || !safeMysteryTitle) return false;
    const assignmentKey = buildMysterySongAssignmentKey(safeGroupTitle, safeMysteryTitle);
    if (!Object.prototype.hasOwnProperty.call(mysterySongAssignments, assignmentKey)) {
      return false;
    }
    delete mysterySongAssignments[assignmentKey];
    return true;
  };

  const fetchMysterySongAssignments = async () => {
    if (songShareViewModeLoaded) {
      mysterySongAssignmentsLoading = false;
      updateMysteryModalSongToggleState();
      renderSongFavorites();
      return false;
    }

    if (!isAuthLoggedIn()) {
      mysterySongAssignmentsLoading = false;
      mysterySongAssignments = {};
      updateMysteryModalSongToggleState();
      renderSongFavorites();
      return false;
    }

    if (mysterySongAssignmentsLoading) return false;
    mysterySongAssignmentsLoading = true;
    try {
      const response = await fetch('/api/mysteries/song-assignments', {
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        mysterySongAssignments = {};
        updateMysteryModalSongToggleState();
        renderSongFavorites();
        return false;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(
          parseMysterySongAssignmentApiError(
            payload,
            readMysteryMessage('assignLoadError')
          )
        );
      }
      const nextAssignments = {};
      const rows = Array.isArray(payload.assignments) ? payload.assignments : [];
      rows.forEach((row) => {
        const normalized = normalizeMysterySongAssignmentPayload(row);
        if (!normalized.groupTitle || !normalized.mysteryTitle) return;
        const key = buildMysterySongAssignmentKey(normalized.groupTitle, normalized.mysteryTitle);
        nextAssignments[key] = normalized;
      });
      mysterySongAssignments = nextAssignments;
      updateMysteryModalSongToggleState();
      renderSongFavorites();
      return true;
    } catch (err) {
      return false;
    } finally {
      mysterySongAssignmentsLoading = false;
    }
  };

  const saveMysterySongAssignmentOnServer = async (groupTitle, mysteryTitle, payload) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para vincular música ao mistério.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeGroupTitle = String(groupTitle || '').trim();
    const safeMysteryTitle = normalizeMysteryName(mysteryTitle);
    if (!safeGroupTitle || !safeMysteryTitle) {
      throw new Error(readMysteryMessage('assignInvalidTarget'));
    }

    const safePayload = asObject(payload);
    const response = await fetch('/api/mysteries/song-assignments', {
      method: 'POST',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        group_title: safeGroupTitle,
        group_day: String(safePayload.groupDay || safePayload.group_day || '').trim(),
        mystery_title: safeMysteryTitle,
        song_title: String(safePayload.songTitle || safePayload.song_title || '').trim(),
        song_artist: String(safePayload.songArtist || safePayload.song_artist || '').trim(),
        song_url: String(safePayload.songUrl || safePayload.song_url || '').trim(),
        source: String(safePayload.source || '').trim(),
        source_label: String(safePayload.sourceLabel || safePayload.source_label || '').trim(),
        image_url: String(safePayload.imageUrl || safePayload.image_url || '').trim(),
        lyrics_text: String(safePayload.lyricsText || safePayload.lyrics_text || ''),
        lyrics_source: String(safePayload.lyricsSource || safePayload.lyrics_source || '').trim(),
        lyrics_source_url: String(safePayload.lyricsSourceUrl || safePayload.lyrics_source_url || '').trim(),
      }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseMysterySongAssignmentApiError(
          responsePayload,
          readMysteryMessage('assignSaveError')
        )
      );
    }
    runDeferredTask(fetchSongFavorites, 80);

    const saved = cacheMysterySongAssignment(responsePayload.assignment);
    if (!saved) {
      throw new Error(readMysteryMessage('assignSaveError'));
    }
    updateMysteryModalSongToggleState();
    return saved;
  };

  const deleteMysterySongAssignmentOnServer = async (groupTitle, mysteryTitle) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para remover vínculo do mistério.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeGroupTitle = String(groupTitle || '').trim();
    const safeMysteryTitle = normalizeMysteryName(mysteryTitle);
    if (!safeGroupTitle || !safeMysteryTitle) {
      throw new Error(readMysteryMessage('assignInvalidTarget'));
    }

    const response = await fetch(
      `/api/mysteries/song-assignments?group_title=${encodeURIComponent(safeGroupTitle)}&mystery_title=${encodeURIComponent(safeMysteryTitle)}`,
      {
        method: 'DELETE',
        headers: buildUserScopedApiHeaders(),
      }
    );
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseMysterySongAssignmentApiError(
          responsePayload,
          readMysteryMessage('assignRemoveError')
        )
      );
    }

    removeCachedMysterySongAssignment(safeGroupTitle, safeMysteryTitle);
    runDeferredTask(fetchSongFavorites, 80);
    updateMysteryModalSongToggleState();
    return Boolean(responsePayload.removed);
  };

  const cacheSongLocationAssignment = (payload) => {
    const normalized = normalizeSongLocationAssignmentPayload(payload);
    const locationId = normalized.locationId;
    if (!locationId) return null;
    songLocationAssignments[locationId] = {
      ...asObject(songLocationAssignments[locationId]),
      ...normalized,
      locationId,
    };
    return asObject(songLocationAssignments[locationId]);
  };

  const removeCachedSongLocationAssignment = (locationId) => {
    const safeLocationId = String(locationId || '').trim();
    if (!safeLocationId) return false;
    if (!Object.prototype.hasOwnProperty.call(songLocationAssignments, safeLocationId)) {
      return false;
    }
    delete songLocationAssignments[safeLocationId];
    return true;
  };

  const fetchSongLocationAssignments = async () => {
    if (songShareViewModeLoaded) {
      songLocationAssignmentsLoading = false;
      renderSongFavorites();
      renderSongSaveLocationPicker();
      updateRosaryModalSongToggleState();
      return false;
    }

    if (!isAuthLoggedIn()) {
      songLocationAssignmentsLoading = false;
      songLocationAssignments = {};
      renderSongFavorites();
      renderSongSaveLocationPicker();
      updateRosaryModalSongToggleState();
      return false;
    }

    if (songLocationAssignmentsLoading) return false;
    songLocationAssignmentsLoading = true;
    try {
      const response = await fetch('/api/song-locations/assignments', {
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        songLocationAssignments = {};
        renderSongFavorites();
        renderSongSaveLocationPicker();
        updateRosaryModalSongToggleState();
        return false;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.detail?.message
          || payload?.message
          || readMysteryMessage('assignLoadError')
        );
      }
      const nextAssignments = {};
      const rows = Array.isArray(payload.assignments) ? payload.assignments : [];
      rows.forEach((row) => {
        const normalized = normalizeSongLocationAssignmentPayload(row);
        if (!normalized.locationId) return;
        nextAssignments[normalized.locationId] = normalized;
      });
      songLocationAssignments = nextAssignments;
      renderSongFavorites();
      renderSongSaveLocationPicker();
      updateRosaryModalSongToggleState();
      return true;
    } catch (err) {
      return false;
    } finally {
      songLocationAssignmentsLoading = false;
    }
  };

  const createSongLocationNodeOnServer = async (label, parentId = '') => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para criar listas na sua árvore.',
      notify: true,
      openLoginModal: true,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeLabel = String(label || '').trim();
    if (!safeLabel) {
      throw new Error(readMysteryMessage('assignCategoryAddInvalid'));
    }
    const safeParentId = String(parentId || '').trim();
    const response = await fetch('/api/song-locations/nodes', {
      method: 'POST',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        parent_id: safeParentId || '',
        label: safeLabel,
      }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        responsePayload?.detail?.message
        || responsePayload?.message
        || readMysteryMessage('assignCategoryAddError')
      );
    }
    return normalizeSongLocationNodePayload(responsePayload.node);
  };

  const deleteSongLocationUserNodeOnServer = async (nodeId) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para remover listas da sua árvore.',
      notify: true,
      openLoginModal: true,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeNodeId = String(nodeId || '').trim();
    if (!safeNodeId) {
      throw new Error(readMysteryMessage('assignCategoryDeleteUserError'));
    }
    const response = await fetch(`/api/song-locations/user-nodes/${encodeURIComponent(safeNodeId)}`, {
      method: 'DELETE',
      headers: buildUserScopedApiHeaders(),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        responsePayload?.detail?.message
        || responsePayload?.message
        || readMysteryMessage('assignCategoryDeleteUserError')
      );
    }
    return responsePayload;
  };

  const deactivateSongLocationNodeOnServer = async (nodeId, password = '') => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para inativar categorias.',
      notify: true,
      openLoginModal: true,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeNodeId = String(nodeId || '').trim();
    const safePassword = String(password || '');
    if (!safeNodeId) {
      throw new Error(readMysteryMessage('assignCategoryDeactivateError'));
    }
    const headers = buildUserScopedApiHeaders();
    if (safePassword.trim()) {
      headers['X-Location-Delete-Password'] = safePassword;
    }
    const response = await fetch(`/api/song-locations/nodes/${encodeURIComponent(safeNodeId)}`, {
      method: 'DELETE',
      headers,
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      const defaultErrorMessage = response.status === 403
        ? readMysteryMessage('assignCategoryDeactivatePasswordInvalid')
        : readMysteryMessage('assignCategoryDeactivateError');
      throw new Error(
        responsePayload?.detail?.message
        || responsePayload?.message
        || defaultErrorMessage
      );
    }
    return responsePayload;
  };

  const saveSongLocationAssignmentOnServer = async (target, payload) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para vincular música ao local.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeTarget = asObject(target);
    const safePayload = asObject(payload);
    const locationId = String(safeTarget.locationId || safeTarget.id || '').trim();
    if (!locationId) {
      throw new Error(readMysteryMessage('assignInvalidTarget'));
    }
    const locationLabel = String(safeTarget.locationLabel || safeTarget.label || '').trim();
    const rawPath = Array.isArray(safeTarget.locationPath) ? safeTarget.locationPath : [];
    const locationPath = rawPath.map((item) => String(item || '').trim()).filter(Boolean);

    const response = await fetch('/api/song-locations/assignments', {
      method: 'POST',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        location_id: locationId,
        location_label: locationLabel,
        location_path: locationPath,
        song_title: String(safePayload.songTitle || safePayload.song_title || '').trim(),
        song_artist: String(safePayload.songArtist || safePayload.song_artist || '').trim(),
        song_url: String(safePayload.songUrl || safePayload.song_url || '').trim(),
        source: String(safePayload.source || '').trim(),
        source_label: String(safePayload.sourceLabel || safePayload.source_label || '').trim(),
        image_url: String(safePayload.imageUrl || safePayload.image_url || '').trim(),
        lyrics_text: String(safePayload.lyricsText || safePayload.lyrics_text || ''),
        lyrics_source: String(safePayload.lyricsSource || safePayload.lyrics_source || '').trim(),
        lyrics_source_url: String(safePayload.lyricsSourceUrl || safePayload.lyrics_source_url || '').trim(),
      }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        responsePayload?.detail?.message
        || responsePayload?.message
        || readMysteryMessage('assignSaveError')
      );
    }

    runDeferredTask(fetchSongFavorites, 80);
    const saved = cacheSongLocationAssignment(responsePayload.assignment);
    if (!saved) {
      throw new Error(readMysteryMessage('assignSaveError'));
    }
    return saved;
  };

  const deleteSongLocationAssignmentOnServer = async (locationId) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para remover vínculo do local.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeLocationId = String(locationId || '').trim();
    if (!safeLocationId) {
      throw new Error(readMysteryMessage('assignInvalidTarget'));
    }

    const response = await fetch(
      `/api/song-locations/assignments?location_id=${encodeURIComponent(safeLocationId)}`,
      {
        method: 'DELETE',
        headers: buildUserScopedApiHeaders(),
      }
    );
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        responsePayload?.detail?.message
        || responsePayload?.message
        || readMysteryMessage('assignRemoveError')
      );
    }

    removeCachedSongLocationAssignment(safeLocationId);
    runDeferredTask(fetchSongFavorites, 80);
    return Boolean(responsePayload.removed);
  };

  const normalizeSongLocationTreeRoots = (rawRoots) => (
    (Array.isArray(rawRoots) ? rawRoots : [])
      .map((row) => normalizeSongLocationNodePayload(row))
      .filter((row) => Boolean(row.id && row.label))
  );

  const fetchSongLocationTree = async () => {
    if (songLocationTreeLoading) return false;
    songLocationTreeLoading = true;
    try {
      let response = await fetch('/api/song-locations', {
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      let payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        response = await fetch('/api/song-locations', { cache: 'no-store' });
        payload = asObject(await response.json().catch(() => ({})));
      }
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.detail?.message
          || payload?.message
          || readMysteryMessage('assignLoadError')
        );
      }
      songLocationTreeRoots = normalizeSongLocationTreeRoots(payload.tree);
      renderSongSaveLocationPicker();
      updateRosaryModalSongToggleState();
      return Array.isArray(songLocationTreeRoots) && songLocationTreeRoots.length > 0;
    } catch (err) {
      return false;
    } finally {
      songLocationTreeLoading = false;
    }
  };

  const isSongSaveLocationPickerOpen = () => Boolean(
    songSaveLocationPicker
    && songSaveLocationPicker.classList.contains('open')
  );

  const readSongSaveLocationPickerAnchorRect = (anchor) => {
    if (!(anchor instanceof HTMLElement) || !anchor.isConnected) return null;
    const rect = anchor.getBoundingClientRect();
    if (
      !Number.isFinite(rect.left)
      || !Number.isFinite(rect.top)
      || !Number.isFinite(rect.width)
      || !Number.isFinite(rect.height)
    ) {
      return null;
    }
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  };

  const resolveSongSaveLocationPickerAnchor = (triggerAnchor, activeAnchor) => {
    const baseAnchor = triggerAnchor || activeAnchor;
    if (!(baseAnchor instanceof HTMLElement) || !baseAnchor.isConnected) return null;
    const songItemAnchor = baseAnchor.closest('.song-favorite-item, .song-search-item');
    if (songItemAnchor instanceof HTMLElement && songItemAnchor.isConnected) {
      return songItemAnchor;
    }
    return baseAnchor;
  };

  const normalizeSongSaveLocationPickerPointer = (rawPointer) => {
    const payload = asObject(rawPointer);
    const candidateX = Number(payload.x ?? payload.clientX ?? payload.pointerX ?? Number.NaN);
    const candidateY = Number(payload.y ?? payload.clientY ?? payload.pointerY ?? Number.NaN);
    if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) {
      return null;
    }
    return {
      x: candidateX,
      y: candidateY,
    };
  };

  const positionSongSaveLocationPicker = () => {
    if (!songSaveLocationPicker || !isSongSaveLocationPickerOpen()) return;
    const anchor = (
      songSaveLocationPickerAnchor instanceof HTMLElement
      && songSaveLocationPickerAnchor.isConnected
    )
      ? songSaveLocationPickerAnchor
      : null;

    const viewportPadding = 8;
    const anchorRect = anchor
      ? readSongSaveLocationPickerAnchorRect(anchor)
      : songSaveLocationPickerAnchorRect;
    const readElementRenderWidth = (element) => {
      if (!(element instanceof HTMLElement)) return 0;
      return Math.max(
        element.offsetWidth || 0,
        element.clientWidth || 0,
        element.scrollWidth || 0
      );
    };
    const measureNodeTextWidth = (element) => {
      if (!(element instanceof HTMLElement) || !songSaveLocationPickerTextMeasureContext) return 0;
      const content = String(element.textContent || '').trim();
      if (!content) return 0;
      const styles = window.getComputedStyle(element);
      const font = styles.font || [
        styles.fontStyle,
        styles.fontVariant,
        styles.fontWeight,
        styles.fontSize,
        styles.lineHeight ? `/${styles.lineHeight}` : '',
        styles.fontFamily,
      ].filter(Boolean).join(' ');
      songSaveLocationPickerTextMeasureContext.font = font || '700 13px sans-serif';
      return Math.ceil(songSaveLocationPickerTextMeasureContext.measureText(content).width);
    };
    const viewportMaxWidth = Math.max(160, window.innerWidth - (viewportPadding * 2));
    const maxWidth = viewportMaxWidth;
    const maxTitleWidth = Math.max(
      0,
      ...Array.from(songSaveLocationPickerList?.querySelectorAll('.song-save-location-picker-item-title') || [])
        .map((node) => measureNodeTextWidth(node))
    );
    const maxMetaWidth = Math.max(
      0,
      ...Array.from(songSaveLocationPickerList?.querySelectorAll('.song-save-location-picker-item-meta') || [])
        .map((node) => measureNodeTextWidth(node))
    );
    const songLineWidth = measureNodeTextWidth(songSaveLocationPickerSong);
    const breadcrumbWidth = measureNodeTextWidth(songSaveLocationPickerBreadcrumb);
    const listWidthTarget = Math.max(maxTitleWidth, maxMetaWidth) + 88;
    const headerWidthTarget = Math.max(songLineWidth, breadcrumbWidth) + 94;
    songSaveLocationPicker.style.width = 'auto';
    songSaveLocationPicker.style.minWidth = '170px';
    songSaveLocationPicker.style.maxWidth = `${Math.round(maxWidth)}px`;
    const measuredWidth = Math.max(
      250,
      listWidthTarget,
      headerWidthTarget,
      readElementRenderWidth(songSaveLocationPicker),
      readElementRenderWidth(songSaveLocationPickerList),
      readElementRenderWidth(songSaveLocationPicker.querySelector('.song-save-location-picker-head')),
      readElementRenderWidth(songSaveLocationPicker.querySelector('.song-save-location-picker-tools'))
    );
    const pickerWidth = Math.min(
      Math.max(measuredWidth, 170),
      maxWidth
    );
    const viewportMaxHeight = Math.max(
      120,
      Math.min(
        Math.floor(window.innerHeight * 0.76),
        window.innerHeight - (viewportPadding * 2)
      )
    );
    songSaveLocationPicker.style.width = `${Math.round(pickerWidth)}px`;
    songSaveLocationPicker.style.height = 'auto';
    songSaveLocationPicker.style.maxHeight = `${Math.round(viewportMaxHeight)}px`;
    const measuredHeight = songSaveLocationPicker.offsetHeight
      || songSaveLocationPicker.scrollHeight
      || 340;
    const currentHeight = Math.min(measuredHeight, viewportMaxHeight);
    const pointer = normalizeSongSaveLocationPickerPointer(songSaveLocationPickerPointer);

    let left = Math.max(
      viewportPadding,
      Math.round((window.innerWidth - pickerWidth) / 2)
    );
    let top = Math.max(
      viewportPadding,
      Math.round((window.innerHeight - currentHeight) / 2)
    );

    if (pointer) {
      const pointerGap = 10;
      const rightLeft = pointer.x + pointerGap;
      const leftLeft = pointer.x - pickerWidth - pointerGap;
      if (rightLeft + pickerWidth <= window.innerWidth - viewportPadding) {
        left = rightLeft;
      } else if (leftLeft >= viewportPadding) {
        left = leftLeft;
      } else {
        left = pointer.x - (pickerWidth / 2);
      }
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - pickerWidth - viewportPadding));

      const belowTop = pointer.y + pointerGap;
      const aboveTop = pointer.y - currentHeight - pointerGap;
      if (belowTop + currentHeight <= window.innerHeight - viewportPadding) {
        top = belowTop;
      } else if (aboveTop >= viewportPadding) {
        top = aboveTop;
      } else {
        top = pointer.y - (currentHeight / 2);
      }
      top = Math.max(viewportPadding, Math.min(top, window.innerHeight - currentHeight - viewportPadding));
    } else if (anchorRect) {
      const anchorGap = 10;
      const rightLeft = anchorRect.right + anchorGap;
      const leftLeft = anchorRect.left - pickerWidth - anchorGap;
      if (rightLeft + pickerWidth <= window.innerWidth - viewportPadding) {
        left = rightLeft;
      } else if (leftLeft >= viewportPadding) {
        left = leftLeft;
      } else {
        left = anchorRect.left;
      }
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - pickerWidth - viewportPadding));

      const belowTop = anchorRect.bottom + anchorGap;
      const aboveTop = anchorRect.top - currentHeight - anchorGap;
      if (belowTop + currentHeight <= window.innerHeight - viewportPadding) {
        top = belowTop;
      } else if (aboveTop >= viewportPadding) {
        top = aboveTop;
      } else {
        const maxTop = Math.max(viewportPadding, window.innerHeight - currentHeight - viewportPadding);
        top = Math.max(viewportPadding, Math.min(anchorRect.top, maxTop));
      }
    }

    songSaveLocationPicker.style.left = `${Math.round(left)}px`;
    songSaveLocationPicker.style.top = `${Math.round(top)}px`;
  };

  const isSongLocationCreateModalOpen = () => Boolean(
    songLocationCreateModal
    && songLocationCreateModal.classList.contains('open')
  );

  const normalizeSongLocationCreateParentLookup = (value) => (
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  );

  const openSongLocationCreateParentPicker = () => {
    if (!songLocationCreateParentPicker) return;
    songLocationCreateParentPicker.hidden = false;
  };

  const closeSongLocationCreateParentPicker = () => {
    if (!songLocationCreateParentPicker) return;
    songLocationCreateParentPicker.hidden = true;
  };

  const isSongLocationCreateParentPickerOpen = () => Boolean(
    songLocationCreateParentPicker
    && !songLocationCreateParentPicker.hidden
  );

  const buildSongLocationCreateParentNodes = () => {
    const roots = buildSongSaveLocationPickerTree();

    const visitNode = (rawNode, parentPathLabels = []) => {
      const node = asObject(rawNode);
      if (String(node.nodeType || '').trim() !== 'location-node') return null;

      const locationId = String(node.locationId || '').trim()
        || String(node.id || '').trim().replace(/^location:/i, '').trim();
      const label = String(node.label || node.locationLabel || '').trim();
      if (!locationId || !label) return null;

      const locationPath = Array.isArray(node.locationPath)
        ? node.locationPath.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const pathLabels = locationPath.length
        ? locationPath
        : [...parentPathLabels, label];
      const pathLabel = pathLabels.join(' / ');
      const children = (Array.isArray(node.children) ? node.children : [])
        .map((child) => visitNode(child, pathLabels))
        .filter(Boolean);

      return {
        id: locationId,
        label,
        pathLabels,
        pathLabel,
        lookupKey: normalizeSongLocationCreateParentLookup(pathLabel || label),
        labelLookupKey: normalizeSongLocationCreateParentLookup(label),
        canDelete: Boolean(node.canDelete),
        children,
      };
    };

    return (Array.isArray(roots) ? roots : [])
      .map((node) => visitNode(node, []))
      .filter(Boolean);
  };

  const flattenSongLocationCreateParentNodes = (nodes, result = []) => {
    if (!Array.isArray(nodes)) return result;
    nodes.forEach((node) => {
      const safeNode = asObject(node);
      const id = String(safeNode.id || '').trim();
      const label = String(safeNode.label || '').trim();
      const pathLabel = String(safeNode.pathLabel || '').trim();
      if (id && label) {
        result.push({
          id,
          label,
          pathLabel: pathLabel || label,
          lookupKey: normalizeSongLocationCreateParentLookup(pathLabel || label),
          labelLookupKey: normalizeSongLocationCreateParentLookup(label),
          canDelete: Boolean(safeNode.canDelete),
        });
      }
      flattenSongLocationCreateParentNodes(
        Array.isArray(safeNode.children) ? safeNode.children : [],
        result
      );
    });
    return result;
  };

  const filterSongLocationCreateParentNodes = (nodes, rawQuery) => {
    const query = normalizeSongLocationCreateParentLookup(rawQuery);
    if (!query) return Array.isArray(nodes) ? nodes : [];
    const filtered = [];
    (Array.isArray(nodes) ? nodes : []).forEach((rawNode) => {
      const node = asObject(rawNode);
      const nodeLookup = normalizeSongLocationCreateParentLookup(
        String(node.pathLabel || node.label || '').trim()
      );
      const labelLookup = normalizeSongLocationCreateParentLookup(String(node.label || '').trim());
      const filteredChildren = filterSongLocationCreateParentNodes(node.children, query);
      const isMatch = nodeLookup.includes(query) || labelLookup.includes(query);
      if (!isMatch && !filteredChildren.length) return;
      filtered.push({
        ...node,
        children: filteredChildren,
      });
    });
    return filtered;
  };

  const selectSongLocationCreateParentNode = (nodePayload) => {
    const node = asObject(nodePayload);
    const selectedId = String(node.id || '').trim();
    const selectedLabel = String(node.pathLabel || node.label || '').trim();
    if (!selectedId || !selectedLabel) return;
    songLocationCreateModalParentId = selectedId;
    songLocationCreateModalParentLabel = selectedLabel;
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.value = selectedLabel;
    }
    if (songLocationCreateParentIdInput) {
      songLocationCreateParentIdInput.value = selectedId;
    }
    syncSongLocationCreateModalTargetState();
    renderSongLocationCreateParentPickerTree();
    closeSongLocationCreateParentPicker();
  };

  const deleteSongLocationCreateParentNode = async (nodePayload, triggerElement = null) => {
    const node = asObject(nodePayload);
    const nodeId = String(node.id || '').trim();
    const nodePathLabel = String(node.pathLabel || node.label || '').trim();
    if (!nodeId || !Boolean(node.canDelete)) {
      showSongToast(
        readMysteryMessage('assignCategoryDeleteUserNotAllowed'),
        'is-warning'
      );
      return false;
    }

    const shouldDelete = await openFavoriteConfirmModal({
      triggerElement,
      title: readMysteryMessage('assignCategoryDeleteUserConfirmTitle'),
      message: readMysteryMessage('assignCategoryDeleteUserConfirmMessage',
        { title: nodePathLabel || nodeId }
      ),
      cancelLabel: readMysteryMessage('favoriteRemoveConfirmCancel'),
      acceptLabel: readMysteryMessage('assignCategoryDeleteUserConfirmAccept'),
    });
    if (!shouldDelete) return false;

    try {
      const deletePayload = asObject(await deleteSongLocationUserNodeOnServer(nodeId));
      const removedIds = (Array.isArray(deletePayload.removed_node_ids) ? deletePayload.removed_node_ids : [])
        .map((rawId) => String(rawId || '').trim())
        .filter(Boolean);
      removedIds.forEach((removedId) => {
        removeCachedSongLocationAssignment(removedId);
      });

      if (songLocationCreateModalParentId && removedIds.includes(songLocationCreateModalParentId)) {
        songLocationCreateModalParentId = '';
        songLocationCreateModalParentLabel = '';
        if (songLocationCreateParentInput) {
          songLocationCreateParentInput.value = '';
        }
        if (songLocationCreateParentIdInput) {
          songLocationCreateParentIdInput.value = '';
        }
      }

      await Promise.allSettled([
        fetchSongLocationTree(),
        fetchSongLocationAssignments(),
      ]);
      populateSongLocationCreateParentSelect(songLocationCreateModalParentId);
      renderSongLocationCreateParentPickerTree();
      renderSongSaveLocationPicker();
      renderSongFavorites();
      positionSongSaveLocationPicker();
      showSongToast(
        readMysteryMessage('assignCategoryDeleteUserSuccess'),
        'is-success'
      );
      return true;
    } catch (err) {
      showSongToast(
        err instanceof Error ? err.message : readMysteryMessage('assignCategoryDeleteUserError'),
        'is-error'
      );
      return false;
    }
  };

  const renderSongLocationCreateParentPickerTree = () => {
    if (!songLocationCreateParentTree) return;
    songLocationCreateParentTree.innerHTML = '';
    const rawQuery = String(songLocationCreateParentInput?.value || '').trim();
    const hasSearchQuery = Boolean(rawQuery);
    const filteredNodes = filterSongLocationCreateParentNodes(songLocationCreateParentNodes, rawQuery);
    if (!filteredNodes.length) {
      if (songLocationCreateParentEmpty) {
        songLocationCreateParentEmpty.hidden = false;
        songLocationCreateParentEmpty.textContent = rawQuery
          ? readMysteryMessage('assignSearchEmpty', { query: rawQuery })
          : readMysteryMessage('assignCategoryAddParentEmpty');
      }
      return;
    }
    if (songLocationCreateParentEmpty) {
      songLocationCreateParentEmpty.hidden = true;
      songLocationCreateParentEmpty.textContent = '';
    }

    const renderNodes = (nodes) => {
      const list = document.createElement('ul');
      (Array.isArray(nodes) ? nodes : []).forEach((rawNode) => {
        const node = asObject(rawNode);
        const nodeId = String(node.id || '').trim();
        const nodeLabel = String(node.label || '').trim();
        if (!nodeId || !nodeLabel) return;

        const item = document.createElement('li');
        item.className = 'song-location-create-parent-tree-item';
        if (nodeId === String(songLocationCreateModalParentId || '').trim()) {
          item.classList.add('is-selected');
        }

        const row = document.createElement('div');
        row.className = 'song-location-create-parent-tree-row';
        const childNodes = Array.isArray(node.children) ? node.children : [];
        const hasChildren = childNodes.length > 0;
        const childList = hasChildren ? renderNodes(childNodes) : null;
        if (childList) {
          childList.hidden = !hasSearchQuery;
        }

        const labelText = document.createElement('span');
        labelText.className = 'song-location-create-parent-label-text';
        labelText.textContent = nodeLabel;

        if (Boolean(node.canDelete)) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'song-location-create-parent-delete';
          deleteBtn.textContent = '-';
          deleteBtn.title = readMysteryMessage('assignCategoryDeleteUserConfirmAccept');
          deleteBtn.setAttribute('aria-label', readMysteryMessage('assignCategoryDeleteUserConfirmAccept'));
          deleteBtn.addEventListener('click', async () => {
            if (deleteBtn.disabled) return;
            deleteBtn.disabled = true;
            try {
              await deleteSongLocationCreateParentNode(node, deleteBtn);
            } finally {
              deleteBtn.disabled = false;
            }
          });
          row.appendChild(deleteBtn);
        }

        if (hasChildren) {
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'song-location-create-parent-label song-location-create-parent-toggle';
          toggleBtn.setAttribute('aria-expanded', String(hasSearchQuery));

          const caret = document.createElement('span');
          caret.className = 'song-location-create-parent-caret';
          caret.setAttribute('aria-hidden', 'true');
          toggleBtn.appendChild(caret);
          toggleBtn.appendChild(labelText);

          const meta = document.createElement('span');
          meta.className = 'song-location-create-parent-meta';
          meta.textContent = `(${childNodes.length})`;
          toggleBtn.appendChild(meta);

          toggleBtn.addEventListener('click', () => {
            if (!childList) return;
            const nextExpanded = toggleBtn.getAttribute('aria-expanded') !== 'true';
            toggleBtn.setAttribute('aria-expanded', String(nextExpanded));
            childList.hidden = !nextExpanded;
          });
          row.appendChild(toggleBtn);
        } else {
          const labelNode = document.createElement('span');
          labelNode.className = 'song-location-create-parent-label';
          labelNode.appendChild(labelText);
          row.appendChild(labelNode);
        }

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'song-location-create-parent-select';
        selectBtn.textContent = '+';
        selectBtn.title = 'Selecionar caminho';
        selectBtn.setAttribute('aria-label', 'Selecionar caminho');
        selectBtn.addEventListener('click', () => {
          selectSongLocationCreateParentNode(node);
        });
        row.appendChild(selectBtn);

        item.appendChild(row);
        if (childList) {
          item.appendChild(childList);
        }
        list.appendChild(item);
      });
      return list;
    };

    songLocationCreateParentTree.appendChild(renderNodes(filteredNodes));
  };

  const resolveSongLocationCreateParentChoice = (rawValue = '') => {
    const typedValue = String(rawValue || '').trim();
    if (!typedValue) {
      return {
        matched: true,
        id: '',
        label: '',
        displayLabel: '',
      };
    }

    const typedLookup = normalizeSongLocationCreateParentLookup(typedValue);
    const matchedChoice = songLocationCreateParentEntries.find((choice) => (
      choice.lookupKey === typedLookup
      || choice.labelLookupKey === typedLookup
      || String(choice.pathLabel || '').trim() === typedValue
      || String(choice.label || '').trim() === typedValue
    ));
    if (!matchedChoice) {
      return {
        matched: false,
        id: '',
        label: '',
        displayLabel: typedValue,
      };
    }

    const matchedId = String(matchedChoice.id || '').trim();
    const displayLabel = String(matchedChoice.pathLabel || matchedChoice.label || '').trim();
    return {
      matched: true,
      id: matchedId,
      label: displayLabel,
      displayLabel,
    };
  };

  const setSongLocationCreateModalSubmittingState = (submitting) => {
    songLocationCreateModalSubmitting = Boolean(submitting);
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.disabled = songLocationCreateModalSubmitting;
    }
    if (songLocationCreateInput) {
      songLocationCreateInput.disabled = songLocationCreateModalSubmitting;
    }
    if (songLocationCreateAcceptBtn) {
      songLocationCreateAcceptBtn.disabled = songLocationCreateModalSubmitting;
    }
    if (songLocationCreateCancelBtn) {
      songLocationCreateCancelBtn.disabled = songLocationCreateModalSubmitting;
    }
  };

  const syncSongLocationCreateModalTargetState = () => {
    const parentSelection = resolveSongLocationCreateParentChoice(
      songLocationCreateParentInput ? songLocationCreateParentInput.value : ''
    );
    songLocationCreateModalParentId = parentSelection.id;
    songLocationCreateModalParentLabel = parentSelection.label;
    if (songLocationCreateParentIdInput) {
      songLocationCreateParentIdInput.value = parentSelection.id;
    }

    const titleText = songLocationCreateModalParentLabel
      ? readMysteryMessage('assignCategoryAddPromptChild',
        { parent: songLocationCreateModalParentLabel }
      )
      : readMysteryMessage('assignCategoryAddPromptRoot');
    if (songLocationCreateTitle) {
      songLocationCreateTitle.textContent = titleText;
    }
  };

  const populateSongLocationCreateParentSelect = (preferredParentId = '') => {
    if (!songLocationCreateParentInput) return;
    const safePreferredParentId = String(preferredParentId || '').trim();
    const previousParentId = String(songLocationCreateModalParentId || '').trim();
    const selectedCandidate = safePreferredParentId || previousParentId;
    songLocationCreateParentNodes = buildSongLocationCreateParentNodes();
    songLocationCreateParentEntries = flattenSongLocationCreateParentNodes(songLocationCreateParentNodes, []);

    const selectedChoice = selectedCandidate
      ? songLocationCreateParentEntries.find((entry) => entry.id === selectedCandidate)
      : null;
    const fallbackChoice = selectedChoice || null;
    songLocationCreateModalParentId = fallbackChoice ? String(fallbackChoice.id || '').trim() : '';
    songLocationCreateModalParentLabel = songLocationCreateModalParentId
      ? String(fallbackChoice?.pathLabel || fallbackChoice?.label || '').trim()
      : '';
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.value = fallbackChoice
        ? String(fallbackChoice.pathLabel || fallbackChoice.label || '').trim()
        : '';
    }
    if (songLocationCreateParentIdInput) {
      songLocationCreateParentIdInput.value = songLocationCreateModalParentId;
    }

    renderSongLocationCreateParentPickerTree();
    closeSongLocationCreateParentPicker();
    syncSongLocationCreateModalTargetState();
  };

  const closeSongLocationCreateModal = (options = {}) => {
    if (!songLocationCreateModal) return;
    const safeOptions = asObject(options);
    const restoreFocus = safeOptions.restoreFocus !== false;
    const focusTarget = restoreFocus
      ? (
        songLocationCreateModalFocusTarget instanceof HTMLElement
          ? songLocationCreateModalFocusTarget
          : (songSaveLocationPickerAddBtn instanceof HTMLElement ? songSaveLocationPickerAddBtn : null)
      )
      : null;
    songLocationCreateModal.classList.remove('open');
    songLocationCreateModal.setAttribute('aria-hidden', 'true');
    closeSongLocationCreateParentPicker();
    songLocationCreateModalParentId = '';
    songLocationCreateModalParentLabel = '';
    songLocationCreateParentEntries = [];
    songLocationCreateParentNodes = [];
    songLocationCreateModalFocusTarget = null;
    setSongLocationCreateModalSubmittingState(false);
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.value = '';
    }
    if (songLocationCreateParentIdInput) {
      songLocationCreateParentIdInput.value = '';
    }
    if (songLocationCreateParentTree) {
      songLocationCreateParentTree.innerHTML = '';
    }
    if (songLocationCreateParentEmpty) {
      songLocationCreateParentEmpty.hidden = true;
      songLocationCreateParentEmpty.textContent = '';
    }
    if (songLocationCreateInput) {
      songLocationCreateInput.value = '';
    }
    syncBodyModalLock();
    if (focusTarget instanceof HTMLElement && isSongSaveLocationPickerOpen()) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
  };

  const openSongLocationCreateModal = (parentId = '', parentLabel = '', triggerElement = null) => {
    if (!songLocationCreateModal) return;
    songLocationCreateModalParentId = String(parentId || '').trim();
    songLocationCreateModalParentLabel = String(parentLabel || '').trim();
    songLocationCreateModalFocusTarget = triggerElement instanceof HTMLElement
      ? triggerElement
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    populateSongLocationCreateParentSelect(songLocationCreateModalParentId);
    if (songLocationCreateTargetHint) {
      songLocationCreateTargetHint.textContent = readMysteryMessage('assignCategoryAddTargetField');
    }
    const hintText = readMysteryMessage('assignCategoryAddPromptField');
    if (songLocationCreateHint) {
      songLocationCreateHint.textContent = hintText;
    }
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.placeholder = readMysteryMessage('assignSearchPlaceholder');
      songLocationCreateParentInput.setAttribute(
        'aria-label',
        readMysteryMessage('assignCategoryAddTargetField')
      );
    }
    if (songLocationCreateInput) {
      songLocationCreateInput.value = '';
      songLocationCreateInput.placeholder = readMysteryMessage('assignCategoryAddModalPlaceholder');
      songLocationCreateInput.setAttribute('aria-label', hintText);
    }
    setSongLocationCreateModalSubmittingState(false);
    songLocationCreateModal.classList.add('open');
    songLocationCreateModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    window.requestAnimationFrame(() => {
      if (songLocationCreateInput instanceof HTMLElement) {
        focusWithoutScrollingPage(songLocationCreateInput);
      }
    });
  };

  const submitSongLocationCreateModal = async () => {
    if (!songLocationCreateModal || !isSongLocationCreateModalOpen() || songLocationCreateModalSubmitting) {
      return;
    }
    syncSongLocationCreateModalTargetState();
    const label = String(songLocationCreateInput?.value || '').trim();
    if (!label) {
      showSongToast(
        readMysteryMessage('assignCategoryAddInvalid'),
        'is-warning'
      );
      if (songLocationCreateInput instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          focusWithoutScrollingPage(songLocationCreateInput);
        });
      }
      return;
    }

    const parentSelection = resolveSongLocationCreateParentChoice(
      songLocationCreateParentInput ? songLocationCreateParentInput.value : ''
    );
    if (!parentSelection.matched) {
      showSongToast(
        readMysteryMessage('assignCategoryAddParentInvalid'),
        'is-warning'
      );
      if (songLocationCreateParentInput instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          focusWithoutScrollingPage(songLocationCreateParentInput);
        });
      }
      return;
    }
    songLocationCreateModalParentId = parentSelection.id;
    songLocationCreateModalParentLabel = parentSelection.label;
    if (songLocationCreateParentInput) {
      songLocationCreateParentInput.value = parentSelection.displayLabel;
    }
    if (songLocationCreateParentIdInput) {
      songLocationCreateParentIdInput.value = parentSelection.id;
    }

    setSongLocationCreateModalSubmittingState(true);
    try {
      const selectedParentId = String(songLocationCreateModalParentId || '').trim();
      const selectedParentLabel = String(songLocationCreateModalParentLabel || '').trim();
      const createdItemPath = [
        selectedParentLabel || readMysteryMessage('assignCategoryRootLabel'),
        label,
      ]
        .filter(Boolean)
        .join(' / ');
      await createSongLocationNodeOnServer(label, selectedParentId);
      if (songSaveLocationPickerSearchQuery.trim()) {
        songSaveLocationPickerSearchQuery = '';
        if (songSaveLocationPickerSearchInput) {
          songSaveLocationPickerSearchInput.value = '';
        }
      }
      await fetchSongLocationTree();
      populateSongLocationCreateParentSelect(selectedParentId);
      renderSongSaveLocationPicker();
      positionSongSaveLocationPicker();
      if (songLocationCreateInput) {
        songLocationCreateInput.value = '';
      }
      showSongToast(
        `${readMysteryMessage('assignCategoryAddSuccess')} Caminho: ${createdItemPath}`,
        'is-success'
      );
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readMysteryMessage('assignCategoryAddError');
      showSongToast(message, 'is-error');
    } finally {
      if (isSongLocationCreateModalOpen()) {
        setSongLocationCreateModalSubmittingState(false);
        if (songLocationCreateInput instanceof HTMLElement) {
          window.requestAnimationFrame(() => {
            focusWithoutScrollingPage(songLocationCreateInput);
          });
        }
      }
    }
  };

  const closeSongSaveLocationPicker = () => {
    if (!songSaveLocationPicker) return;
    if (isSongLocationCreateModalOpen()) {
      closeSongLocationCreateModal({ restoreFocus: false });
    }
    const focusTarget = songSaveLocationPickerFocusTarget instanceof HTMLElement
      ? songSaveLocationPickerFocusTarget
      : (
        songSaveLocationPickerAnchor instanceof HTMLElement
          ? songSaveLocationPickerAnchor
          : null
      );
    songSaveLocationPicker.classList.remove('open');
    songSaveLocationPicker.setAttribute('aria-hidden', 'true');
    songSaveLocationPicker.removeAttribute('style');
    syncBodyModalLock();
    songSaveLocationPickerPendingSong = null;
    songSaveLocationPickerAnchor = null;
    songSaveLocationPickerAnchorRect = null;
    songSaveLocationPickerFocusTarget = null;
    songSaveLocationPickerPointer = null;
    songSaveLocationPickerPath = [];
    songSaveLocationPickerBaseDepth = 0;
    songSaveLocationPickerSearchQuery = '';
    if (songSaveLocationPickerSearchInput) {
      songSaveLocationPickerSearchInput.value = '';
    }
    if (focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
  };

  const resolveMysteryGroupItems = (groupTitle) => {
    const normalizedGroupKey = canonicalMysteryGroupKey(groupTitle);
    if (!normalizedGroupKey) return [];

    const catalogGroup = mysterySongGroupsCatalog.find(
      (entry) => canonicalMysteryGroupKey(entry.title) === normalizedGroupKey
    );
    if (catalogGroup && Array.isArray(catalogGroup.items) && catalogGroup.items.length) {
      return catalogGroup.items.map((item) => normalizeMysteryName(item)).filter(Boolean);
    }

    const fallbackEntry = Object.entries(asObject(mysteryItemsByGroup)).find(
      ([rawGroupTitle]) => canonicalMysteryGroupKey(rawGroupTitle) === normalizedGroupKey
    );
    const fallbackItems = fallbackEntry ? fallbackEntry[1] : [];
    return Array.isArray(fallbackItems)
      ? fallbackItems.map((item) => normalizeMysteryName(item)).filter(Boolean)
      : [];
  };

  const buildMysteryPickerLeafNodes = (group) => {
    const safeGroup = asObject(group);
    const groupTitle = String(safeGroup.title || '').trim();
    const groupDay = String(safeGroup.day || '').trim();
    const groupKey = canonicalMysteryGroupKey(groupTitle);
    if (!groupKey) return [];

    const groupItems = resolveMysteryGroupItems(groupTitle);
    return groupItems.map((itemTitle, index) => ({
      id: `item:mystery:${groupKey}:${index + 1}:${normalizeKeyToken(itemTitle)}`,
      label: formatMysteryItemLabel(itemTitle, index),
      meta: '',
      leafType: 'mystery',
      groupTitle,
      groupDay,
      mysteryTitle: itemTitle,
    }));
  };

  const buildSongSaveLocationPickerTree = () => {
    const buildFromDynamicRoots = () => {
      if (!Array.isArray(songLocationTreeRoots) || !songLocationTreeRoots.length) return [];

      const visitNode = (rawNode, parentNodes = []) => {
        const node = asObject(rawNode);
        const nodeId = String(node.id || node.nodeId || '').trim();
        const nodeLabel = String(node.label || '').trim();
        if (!nodeId || !nodeLabel) return null;

        const currentPathNodes = [...parentNodes, { label: nodeLabel, id: nodeId }];
        const childNodes = (Array.isArray(node.children) ? node.children : [])
          .map((child) => visitNode(child, currentPathNodes))
          .filter(Boolean);
        const hasChildren = childNodes.length > 0;
        const assignmentMode = String(node.assignmentMode || node.assignment_mode || 'location').trim().toLowerCase() === 'mystery'
          ? 'mystery'
          : 'location';
        const isUserOwnedNode = /^u\d+$/i.test(nodeId);

        const safePathLabels = currentPathNodes
          .map((pathNode) => String(pathNode.label || '').trim())
          .filter(Boolean);
        const parentLabel = parentNodes.length
          ? String(parentNodes[parentNodes.length - 1].label || '').trim()
          : '';
        const mysteryGroupTitle = String(node.mysteryGroupTitle || node.mystery_group_title || '').trim() || parentLabel;
        const mysteryTitle = normalizeMysteryName(node.mysteryTitle || node.mystery_title || nodeLabel);

        return {
          id: `location:${nodeId}`,
          label: nodeLabel,
          meta: '',
          nodeType: 'location-node',
          locationId: nodeId,
          locationLabel: nodeLabel,
          locationPath: safePathLabels,
          canDelete: isUserOwnedNode,
          assignmentMode,
          leafType: hasChildren
            ? ''
            : (assignmentMode === 'mystery' ? 'mystery' : 'location'),
          groupTitle: mysteryGroupTitle,
          mysteryTitle,
          children: childNodes,
        };
      };

      return songLocationTreeRoots
        .map((node) => visitNode(node))
        .filter(Boolean);
    };

    const dynamicRoots = buildFromDynamicRoots();
    if (dynamicRoots.length) {
      return dynamicRoots;
    }

    const mysteryChildren = mysterySongGroupsCatalog.map((group) => {
      const groupKey = canonicalMysteryGroupKey(group.title);
      return {
        id: `group:mystery:${groupKey}`,
        label: group.title,
        meta: group.day || '',
        nodeType: 'mystery-group',
        groupTitle: group.title,
        groupDay: group.day || '',
        children: buildMysteryPickerLeafNodes(group),
      };
    });
    if (!mysteryChildren.length) return [];

    const mysteryNode = {
      id: 'category:mystery',
      label: readMysteryMessage('assignCategoryMystery'),
      meta: '',
      children: mysteryChildren,
    };

    return [mysteryNode];
  };

  const normalizeSongSaveLocationPickerSearchQuery = (value) => (
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
  );

  const buildSongSaveLocationPickerSearchEntries = (roots) => {
    const entries = [];

    const walkNodes = (nodes, parentPathNodes = []) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach((rawNode) => {
        const node = asObject(rawNode);
        const nodeId = String(node.id || '').trim();
        const nodeLabel = String(node.label || '').trim();
        if (!nodeId || !nodeLabel) return;

        const pathNodes = [...parentPathNodes, node];
        const pathLabel = pathNodes
          .map((pathNode) => String(pathNode.label || '').trim())
          .filter(Boolean)
          .join(' -> ');
        const searchText = normalizeKeyToken([
          nodeLabel,
          String(node.meta || '').trim(),
          String(node.mysteryTitle || '').trim(),
          pathLabel,
        ].filter(Boolean).join(' '));

        entries.push({
          node,
          pathNodes,
          pathIds: pathNodes.map((pathNode) => String(pathNode.id || '').trim()).filter(Boolean),
          pathLabel,
          searchText,
        });

        if (Array.isArray(node.children) && node.children.length) {
          walkNodes(node.children, pathNodes);
        }
      });
    };

    walkNodes(roots);
    return entries;
  };

  const resolveSongSaveLocationPickerSearchResults = (roots, rawQuery) => {
    const normalizedQuery = normalizeKeyToken(normalizeSongSaveLocationPickerSearchQuery(rawQuery));
    if (!normalizedQuery) return [];
    return buildSongSaveLocationPickerSearchEntries(roots).filter((entry) => (
      String(entry.searchText || '').includes(normalizedQuery)
    ));
  };

  const resolveSongSaveLocationPickerBranch = () => {
    const roots = buildSongSaveLocationPickerTree();
    let currentNodes = roots;
    const nextPath = [];
    const pathNodes = [];

    songSaveLocationPickerPath.forEach((pathKey) => {
      const found = currentNodes.find((node) => node && node.id === pathKey && Array.isArray(node.children));
      if (!found || !Array.isArray(found.children)) return;
      pathNodes.push(found);
      nextPath.push(pathKey);
      currentNodes = found.children;
    });

    if (nextPath.length !== songSaveLocationPickerPath.length) {
      songSaveLocationPickerPath = nextPath;
    }

    return {
      roots,
      pathNodes,
      currentNodes,
    };
  };

  const assignPendingSongToMysteryTarget = async (target, triggerElement = null) => {
    const safeTarget = asObject(target);
    const groupTitle = String(safeTarget.groupTitle || '').trim();
    const mysteryTitle = normalizeMysteryName(safeTarget.mysteryTitle || '');
    if (!groupTitle || !mysteryTitle) {
      showSongToast(
        readMysteryMessage('assignInvalidTarget'),
        'is-error'
      );
      return false;
    }

    const song = asObject(songSaveLocationPickerPendingSong || mysterySongAssignPendingSong);
    if (!song.title && !song.url) {
      showSongToast(
        readMysteryMessage('assignSongInvalid'),
        'is-error'
      );
      return false;
    }
    if (!ensureSongShareImportForMutations(triggerElement)) {
      return false;
    }

    const currentAssignment = getMysterySongAssignment(groupTitle, mysteryTitle);
    const hasCurrentAssignment = Boolean(currentAssignment.songTitle || currentAssignment.songUrl);
    if (hasCurrentAssignment) {
      const currentSongTitle = String(currentAssignment.songTitle || '').trim()
        || readSongMessage('defaultSongTitle');
      const nextSongTitle = String(song.title || '').trim()
        || readSongMessage('defaultSongTitle');
      const removeMessage = readMysteryMessage('assignRemoveConfirmMessageWithTitle',
        { title: currentSongTitle }
      );
      const existingAction = await openFavoriteDecisionModal({
        triggerElement,
        title: readMysteryMessage('assignExistingChoiceTitle'),
        message: readMysteryMessage('assignExistingChoiceMessage',
          { current: currentSongTitle, next: nextSongTitle }
        ),
        cancelLabel: readMysteryMessage('assignExistingChoiceRemove'),
        acceptLabel: readMysteryMessage('assignExistingChoiceReplace'),
        fallbackCancelConfirmMessage: removeMessage,
      });
      if (existingAction === FAVORITE_CONFIRM_ACTION_DISMISS) return false;

      if (existingAction === FAVORITE_CONFIRM_ACTION_CANCEL) {
        try {
          await deleteMysterySongAssignmentOnServer(groupTitle, mysteryTitle);
        } catch (err) {
          const message = err instanceof Error
            ? err.message
            : readMysteryMessage('assignRemoveError');
          showSongToast(message, 'is-error');
          return false;
        }

        if (
          canonicalMysteryGroupKey(groupTitle) === canonicalMysteryGroupKey(currentMysteryModalSelection.group)
          && normalizeMysteryName(mysteryTitle) === normalizeMysteryName(currentMysteryModalSelection.title)
        ) {
          closeMysterySongPanel();
          updateMysteryModalSongToggleState();
        }

        renderMysterySongAssignList();
        renderSongSaveLocationPicker();
        renderSongFavorites();
        leaveSongShareViewModeAfterMutation();
        showSongToast(
          readMysteryMessage('assignRemoveSuccess'),
          'is-success'
        );
        return true;
      }
    }

    try {
      await saveMysterySongAssignmentOnServer(groupTitle, mysteryTitle, {
        songTitle: String(song.title || '').trim(),
        songArtist: String(song.artist || '').trim(),
        songUrl: String(song.url || '').trim(),
        source: String(song.source || '').trim(),
        sourceLabel: resolveSongSourceLabel(
          String(song.source || '').trim(),
          String(song.source_label || '').trim()
        ),
        imageUrl: String(song.image_url || '').trim(),
        lyricsText: '',
        lyricsSource: '',
        lyricsSourceUrl: '',
        groupDay: String(safeTarget.groupDay || '').trim(),
      });
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readMysteryMessage('assignSaveError');
      showSongToast(message, 'is-error');
      return false;
    }

    if (
      canonicalMysteryGroupKey(groupTitle) === canonicalMysteryGroupKey(currentMysteryModalSelection.group)
      && normalizeMysteryName(mysteryTitle) === normalizeMysteryName(currentMysteryModalSelection.title)
    ) {
      closeMysterySongPanel();
      updateMysteryModalSongToggleState();
    }

    renderMysterySongAssignList();
    renderSongSaveLocationPicker();
    renderSongFavorites();
    leaveSongShareViewModeAfterMutation();
    showSongToast(
      readMysteryMessage('assignSuccess'),
      'is-success'
    );
    positionSongSaveLocationPicker();
    return true;
  };

  const assignPendingSongToLocationTarget = async (target, triggerElement = null) => {
    const safeTarget = asObject(target);
    const locationId = String(safeTarget.locationId || safeTarget.id || '').trim();
    if (!locationId) {
      showSongToast(
        readMysteryMessage('assignInvalidTarget'),
        'is-error'
      );
      return false;
    }

    const song = asObject(songSaveLocationPickerPendingSong || mysterySongAssignPendingSong);
    if (!song.title && !song.url) {
      showSongToast(
        readMysteryMessage('assignSongInvalid'),
        'is-error'
      );
      return false;
    }
    if (!ensureSongShareImportForMutations(triggerElement)) {
      return false;
    }

    const currentAssignment = getSongLocationAssignment(locationId);
    const hasCurrentAssignment = Boolean(currentAssignment.songTitle || currentAssignment.songUrl);
    if (hasCurrentAssignment) {
      const currentSongTitle = String(currentAssignment.songTitle || '').trim()
        || readSongMessage('defaultSongTitle');
      const nextSongTitle = String(song.title || '').trim()
        || readSongMessage('defaultSongTitle');
      const removeMessage = readMysteryMessage('assignRemoveConfirmMessageWithTitle',
        { title: currentSongTitle }
      );
      const existingAction = await openFavoriteDecisionModal({
        triggerElement,
        title: readMysteryMessage('assignExistingChoiceTitle'),
        message: readMysteryMessage('assignExistingChoiceMessage',
          { current: currentSongTitle, next: nextSongTitle }
        ),
        cancelLabel: readMysteryMessage('assignExistingChoiceRemove'),
        acceptLabel: readMysteryMessage('assignExistingChoiceReplace'),
        fallbackCancelConfirmMessage: removeMessage,
      });
      if (existingAction === FAVORITE_CONFIRM_ACTION_DISMISS) return false;

      if (existingAction === FAVORITE_CONFIRM_ACTION_CANCEL) {
        try {
          await deleteSongLocationAssignmentOnServer(locationId);
        } catch (err) {
          const message = err instanceof Error
            ? err.message
            : readMysteryMessage('assignRemoveError');
          showSongToast(message, 'is-error');
          return false;
        }

        renderSongSaveLocationPicker();
        renderSongFavorites();
        leaveSongShareViewModeAfterMutation();
        showSongToast(
          readMysteryMessage('assignRemoveSuccess'),
          'is-success'
        );
        return true;
      }
    }

    try {
      const nextPayload = {
        songTitle: String(song.title || '').trim(),
        songArtist: String(song.artist || '').trim(),
        songUrl: String(song.url || '').trim(),
        source: String(song.source || '').trim(),
        sourceLabel: resolveSongSourceLabel(
          String(song.source || '').trim(),
          String(song.source_label || '').trim()
        ),
        imageUrl: String(song.image_url || '').trim(),
        lyricsText: '',
        lyricsSource: '',
        lyricsSourceUrl: '',
      };
      await saveSongLocationAssignmentOnServer(safeTarget, nextPayload);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readMysteryMessage('assignSaveError');
      showSongToast(message, 'is-error');
      return false;
    }

    renderSongSaveLocationPicker();
    renderSongFavorites();
    leaveSongShareViewModeAfterMutation();
    showSongToast(
      readMysteryMessage('assignSuccess'),
      'is-success'
    );
    positionSongSaveLocationPicker();
    return true;
  };

  const deactivateSongLocationNodeFromPicker = async (nodePayload, triggerElement = null) => {
    const node = asObject(nodePayload);
    const nodeId = String(node.locationId || node.id || '').trim();
    const nodeLabel = String(node.label || node.locationLabel || '').trim()
      || readMysteryMessage('assignCategoryRootLabel');
    if (!nodeId) {
      showSongToast(
        readMysteryMessage('assignCategoryDeactivateError'),
        'is-error'
      );
      return false;
    }

    const shouldDeactivate = await openFavoriteConfirmModal({
      triggerElement,
      title: readMysteryMessage('assignCategoryDeactivateConfirmTitle'),
      message: readMysteryMessage('assignCategoryDeactivateConfirmMessage',
        { title: nodeLabel }
      ),
      cancelLabel: readMysteryMessage('favoriteRemoveConfirmCancel'),
      acceptLabel: readMysteryMessage('assignCategoryDeactivateConfirmAccept'),
      requirePassword: true,
      passwordLabel: readMysteryMessage('assignCategoryDeactivatePasswordLabel'),
      passwordPlaceholder: readMysteryMessage('assignCategoryDeactivatePasswordPlaceholder'),
    });
    if (!shouldDeactivate) return false;
    const deactivatePassword = consumeFavoriteConfirmPassword();

    try {
      await deactivateSongLocationNodeOnServer(nodeId, deactivatePassword);
      if (songSaveLocationPickerSearchQuery.trim()) {
        songSaveLocationPickerSearchQuery = '';
        if (songSaveLocationPickerSearchInput) {
          songSaveLocationPickerSearchInput.value = '';
        }
      }
      await fetchSongLocationTree();
      renderSongSaveLocationPicker();
      positionSongSaveLocationPicker();
      showSongToast(
        readMysteryMessage('assignCategoryDeactivateSuccess'),
        'is-success'
      );
      return true;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readMysteryMessage('assignCategoryDeactivateError');
      showSongToast(message, 'is-error');
      return false;
    }
  };

  const renderSongSaveLocationPicker = () => {
    if (!songSaveLocationPickerList) return;
    const branch = resolveSongSaveLocationPickerBranch();
    const pathNodes = branch.pathNodes;
    const nodes = Array.isArray(branch.currentNodes) ? branch.currentNodes : [];
    const normalizedSearchQuery = normalizeSongSaveLocationPickerSearchQuery(songSaveLocationPickerSearchQuery);
    const isSearching = Boolean(normalizedSearchQuery);
    const searchResults = isSearching
      ? resolveSongSaveLocationPickerSearchResults(branch.roots, normalizedSearchQuery)
      : [];
    const canGoBack = !isSearching && pathNodes.length > songSaveLocationPickerBaseDepth;
    const currentParentNode = pathNodes.length ? asObject(pathNodes[pathNodes.length - 1]) : null;
    const currentParentId = currentParentNode
      ? (
        String(currentParentNode.locationId || '').trim()
        || String(currentParentNode.id || '').trim().replace(/^location:/i, '').trim()
      )
      : '';

    if (songSaveLocationPickerSearchInput && songSaveLocationPickerSearchInput.value !== songSaveLocationPickerSearchQuery) {
      songSaveLocationPickerSearchInput.value = songSaveLocationPickerSearchQuery;
    }

    if (songSaveLocationPickerBackBtn) {
      songSaveLocationPickerBackBtn.hidden = !canGoBack;
    }
    if (songSaveLocationPickerAddBtn) {
      const canAdd = isAuthLoggedIn() && !isSearching;
      songSaveLocationPickerAddBtn.hidden = !canAdd;
      songSaveLocationPickerAddBtn.disabled = !canAdd;
      if (canAdd) {
        songSaveLocationPickerAddBtn.dataset.parentId = currentParentId;
        songSaveLocationPickerAddBtn.dataset.parentLabel = String(currentParentNode?.label || '')
          .trim()
          .replace(/\s+/g, ' ');
      } else {
        delete songSaveLocationPickerAddBtn.dataset.parentId;
        delete songSaveLocationPickerAddBtn.dataset.parentLabel;
      }
    }
    if (songSaveLocationPickerBreadcrumb) {
      songSaveLocationPickerBreadcrumb.textContent = isSearching
        ? readMysteryMessage('assignSearchResultsQuery', { query: normalizedSearchQuery })
        : (
          pathNodes.map((node) => node.label || '').filter(Boolean).join(' / ')
          || readMysteryMessage('assignCategorySelect')
        );
    }

    const renderPickerNodeButton = (node, options = {}) => {
      const safeNode = asObject(node);
      const row = document.createElement('div');
      row.className = 'song-save-location-picker-item-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'song-save-location-picker-item';
      button.dataset.nodeId = String(safeNode.id || '');

      const main = document.createElement('span');
      main.className = 'song-save-location-picker-item-main';

      const titleNode = document.createElement('span');
      titleNode.className = 'song-save-location-picker-item-title';
      titleNode.textContent = String(options.pathLabel || safeNode.label || '').trim();
      main.appendChild(titleNode);

      const hasChildren = Array.isArray(safeNode.children) && safeNode.children.length > 0;
      let metaText = String(options.metaText || safeNode.meta || '').trim();
      if (!hasChildren && safeNode.leafType === 'mystery') {
        const assigned = getMysterySongAssignment(safeNode.groupTitle, safeNode.mysteryTitle);
        const assignedSongTitle = String(assigned.songTitle || '').trim();
        if (assignedSongTitle) {
          button.classList.add('is-assigned');
          metaText = readMysteryMessage('assignCurrentSongTitle',
            { title: assignedSongTitle }
          );
        }
      } else if (!hasChildren && safeNode.leafType === 'location') {
        const assigned = getSongLocationAssignment(safeNode.locationId);
        const assignedSongTitle = String(assigned.songTitle || '').trim();
        if (assignedSongTitle) {
          button.classList.add('is-assigned');
          metaText = readMysteryMessage('assignCurrentSongTitle',
            { title: assignedSongTitle }
          );
        }
      }
      if (metaText) {
        const metaNode = document.createElement('span');
        metaNode.className = 'song-save-location-picker-item-meta';
        metaNode.textContent = metaText;
        main.appendChild(metaNode);
      }
      button.appendChild(main);

      if (hasChildren) {
        const arrow = document.createElement('span');
        arrow.className = 'song-save-location-picker-item-arrow';
        arrow.textContent = '>';
        arrow.setAttribute('aria-hidden', 'true');
        button.appendChild(arrow);
      }

      button.addEventListener('click', async () => {
        if (hasChildren) {
          if (Array.isArray(options.pathIds) && options.pathIds.length) {
            songSaveLocationPickerPath = options.pathIds.slice();
          } else {
            songSaveLocationPickerPath.push(String(safeNode.id || ''));
          }
          if (isSearching) {
            songSaveLocationPickerSearchQuery = '';
            if (songSaveLocationPickerSearchInput) {
              songSaveLocationPickerSearchInput.value = '';
            }
          }
          renderSongSaveLocationPicker();
          positionSongSaveLocationPicker();
          return;
        }
        if (safeNode.nodeType === 'mystery-group') {
          const fallbackChildren = buildMysteryPickerLeafNodes({
            title: safeNode.groupTitle || safeNode.label || '',
            day: safeNode.groupDay || safeNode.meta || '',
          });
          if (fallbackChildren.length) {
            safeNode.children = fallbackChildren;
            if (Array.isArray(options.pathIds) && options.pathIds.length) {
              songSaveLocationPickerPath = options.pathIds.slice();
            } else {
              songSaveLocationPickerPath.push(String(safeNode.id || ''));
            }
            if (isSearching) {
              songSaveLocationPickerSearchQuery = '';
              if (songSaveLocationPickerSearchInput) {
                songSaveLocationPickerSearchInput.value = '';
              }
            }
            renderSongSaveLocationPicker();
            positionSongSaveLocationPicker();
            return;
          }
        }
        if (safeNode.leafType === 'mystery') {
          await assignPendingSongToMysteryTarget(safeNode, button);
          return;
        }
        if (safeNode.leafType === 'location') {
          await assignPendingSongToLocationTarget(safeNode, button);
        }
      });
      row.appendChild(button);

      songSaveLocationPickerList.appendChild(row);
    };

    songSaveLocationPickerList.innerHTML = '';
    if (isSearching) {
      if (!searchResults.length) {
        const emptyNode = document.createElement('p');
        emptyNode.className = 'song-save-location-picker-empty';
        emptyNode.textContent = readMysteryMessage('assignSearchEmpty',
          { query: normalizedSearchQuery }
        );
        songSaveLocationPickerList.appendChild(emptyNode);
        return;
      }
      searchResults.forEach((entry) => {
        renderPickerNodeButton(entry.node, {
          pathLabel: entry.pathLabel,
          pathIds: entry.pathIds,
        });
      });
      return;
    }

    if (!nodes.length) {
      const emptyNode = document.createElement('p');
      emptyNode.className = 'song-save-location-picker-empty';
      emptyNode.textContent = readMysteryMessage('assignEmpty');
      songSaveLocationPickerList.appendChild(emptyNode);
      return;
    }

    nodes.forEach((node) => {
      renderPickerNodeButton(node);
    });
  };

  const openSongSaveLocationPicker = async (songPayload, triggerButton = null, options = null) => {
    if (!songSaveLocationPicker || !songSaveLocationPickerList) {
      openMysterySongAssignModal(songPayload, triggerButton);
      return;
    }

    const song = asObject(songPayload);
    const title = String(song.title || '').trim() || readSongMessage('defaultSongTitle');
    const artist = String(song.artist || '').trim();
    songSaveLocationPickerPendingSong = song;
    mysterySongAssignPendingSong = song;
    const triggerAnchor = (
      triggerButton instanceof HTMLElement
      && triggerButton.isConnected
    )
      ? triggerButton
      : null;
    const activeAnchor = (
      document.activeElement instanceof HTMLElement
      && document.activeElement.isConnected
    )
      ? document.activeElement
      : null;
    const resolvedAnchor = resolveSongSaveLocationPickerAnchor(triggerAnchor, activeAnchor);
    const fallbackAnchor = resolvedAnchor || triggerAnchor || activeAnchor;
    songSaveLocationPickerAnchor = fallbackAnchor;
    songSaveLocationPickerAnchorRect = readSongSaveLocationPickerAnchorRect(fallbackAnchor);
    songSaveLocationPickerFocusTarget = triggerAnchor || activeAnchor || fallbackAnchor;
    songSaveLocationPickerPointer = normalizeSongSaveLocationPickerPointer(options);
    songSaveLocationPickerPath = [];
    songSaveLocationPickerBaseDepth = 0;
    songSaveLocationPickerSearchQuery = '';
    if (songSaveLocationPickerSearchInput) {
      songSaveLocationPickerSearchInput.value = '';
    }

    if (songSaveLocationPickerSong) {
      songSaveLocationPickerSong.textContent = artist ? `${title} - ${artist}` : title;
    }

    await Promise.allSettled([
      fetchSongLocationTree(),
      fetchSongLocationAssignments(),
    ]);

    renderSongSaveLocationPicker();
    songSaveLocationPicker.classList.add('open');
    songSaveLocationPicker.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    positionSongSaveLocationPicker();
    window.requestAnimationFrame(() => {
      positionSongSaveLocationPicker();
      if (songSaveLocationPickerSearchInput instanceof HTMLElement) {
        focusWithoutScrollingPage(songSaveLocationPickerSearchInput);
        return;
      }
      const firstAction = songSaveLocationPickerList.querySelector('.song-save-location-picker-item');
      if (firstAction instanceof HTMLElement) {
        focusWithoutScrollingPage(firstAction);
      }
    });
  };

  const closeMysterySongPanel = () => {
    if (mysteryModalSongPanel) {
      mysteryModalSongPanel.hidden = true;
    }
    if (mysteryModalSongTitle) {
      mysteryModalSongTitle.textContent = '';
    }
    if (mysteryModalSongLyrics) {
      mysteryModalSongLyrics.textContent = '';
    }
  };

  const updateMysteryModalSongToggleState = () => {
    if (!mysteryModalSongToggle) return;
    const assignment = getMysterySongAssignment(
      currentMysteryModalSelection.group,
      currentMysteryModalSelection.title
    );
    const hasAssignedSong = Boolean(assignment.songTitle || assignment.songUrl);
    const isPanelVisible = mysteryModalSongPanel ? !mysteryModalSongPanel.hidden : false;
    mysteryModalSongToggle.innerHTML = MYSTERY_MUSIC_NOTE_ICON;
    mysteryModalSongToggle.classList.toggle('is-active', isPanelVisible);
    mysteryModalSongToggle.classList.toggle('is-loading', mysteryModalSongLoading);
    mysteryModalSongToggle.classList.toggle('is-empty', !hasAssignedSong);
    mysteryModalSongToggle.disabled = mysteryModalSongLoading;
    mysteryModalSongToggle.title = hasAssignedSong
      ? readMysteryMessage('songToggleShow')
      : readMysteryMessage('songToggleEmpty');
    mysteryModalSongToggle.setAttribute('aria-label', mysteryModalSongToggle.title);
  };

  const closeRosarySongPanel = () => {
    if (rosaryModalSongPanel) {
      rosaryModalSongPanel.hidden = true;
    }
    if (rosaryModalSongTitle) {
      rosaryModalSongTitle.textContent = '';
    }
    if (rosaryModalSongMeta) {
      rosaryModalSongMeta.textContent = '';
    }
    if (rosaryModalSongExternalActions) {
      rosaryModalSongExternalActions.hidden = true;
    }
    if (rosaryModalSongLyrics) {
      rosaryModalSongLyrics.textContent = '';
    }
  };

  const updateRosaryModalSongToggleState = () => {
    if (!rosaryModalSongToggle) return;
    const currentStep = getRosaryFlowStep();
    const target = resolveRosaryStepSongTarget(currentStep);
    const supportsSong = Boolean(target && Array.isArray(target.locationPath) && target.locationPath.length);
    if (!supportsSong) {
      rosaryModalSongToggle.hidden = true;
      rosaryModalSongToggle.disabled = true;
      rosaryModalSongToggle.classList.remove('is-active', 'is-empty', 'is-loading');
      rosaryModalSongToggle.removeAttribute('aria-label');
      rosaryModalSongToggle.removeAttribute('title');
      closeRosarySongPanel();
      return;
    }

    const assignment = getRosaryStepSongAssignment(currentStep);
    const hasAssignedSong = Boolean(assignment.songTitle || assignment.songUrl);
    const isPanelVisible = rosaryModalSongPanel ? !rosaryModalSongPanel.hidden : false;
    rosaryModalSongToggle.hidden = false;
    rosaryModalSongToggle.innerHTML = MYSTERY_MUSIC_NOTE_ICON;
    rosaryModalSongToggle.classList.toggle('is-active', isPanelVisible);
    rosaryModalSongToggle.classList.toggle('is-loading', rosaryModalSongLoading);
    rosaryModalSongToggle.classList.toggle('is-empty', !hasAssignedSong);
    rosaryModalSongToggle.disabled = rosaryModalSongLoading;
    rosaryModalSongToggle.title = hasAssignedSong
      ? readRosaryMessage('songToggleShow', readMysteryMessage('songToggleShow'))
      : readRosaryMessage('songToggleEmpty', readMysteryMessage('songToggleEmpty'));
    rosaryModalSongToggle.setAttribute('aria-label', rosaryModalSongToggle.title);
  };

  const toggleRosaryModalSongPanel = async () => {
    if (!rosaryModalSongPanel || !rosaryModalSongTitle || !rosaryModalSongLyrics) return;
    const currentStep = getRosaryFlowStep();
    const target = resolveRosaryStepSongTarget(currentStep);
    const supportsSong = Boolean(target && Array.isArray(target.locationPath) && target.locationPath.length);
    if (!supportsSong) return;

    const assignment = getRosaryStepSongAssignment(currentStep);
    if (!assignment.songTitle && !assignment.songUrl) {
      showSongToast(
        readRosaryMessage('songToggleEmpty', readMysteryMessage('songToggleEmpty')),
        'is-warning'
      );
      return;
    }

    const isOpen = !rosaryModalSongPanel.hidden;
    if (isOpen) {
      closeRosarySongPanel();
      updateRosaryModalSongToggleState();
      return;
    }

    rosaryModalSongLoading = true;
    updateRosaryModalSongToggleState();
    try {
      const resolvedAssignment = await resolveMysterySongLyrics(assignment);
      let persistedAssignment = resolvedAssignment;
      const shouldPersistAssignment = Boolean(
        !songShareViewModeLoaded
        && isAuthLoggedIn()
        && target.locationId
      );
      if (shouldPersistAssignment) {
        try {
          persistedAssignment = await saveSongLocationAssignmentOnServer(target, resolvedAssignment);
        } catch (saveErr) {
          persistedAssignment = cacheSongLocationAssignment({
            ...resolvedAssignment,
            locationId: target.locationId,
            locationLabel: target.locationLabel,
            locationPath: target.locationPath,
          }) || resolvedAssignment;
        }
      } else if (target.locationId) {
        persistedAssignment = cacheSongLocationAssignment({
          ...resolvedAssignment,
          locationId: target.locationId,
          locationLabel: target.locationLabel,
          locationPath: target.locationPath,
        }) || resolvedAssignment;
      }
      rosaryModalSongTitle.textContent = persistedAssignment.songArtist
        ? `${persistedAssignment.songTitle} - ${persistedAssignment.songArtist}`
        : persistedAssignment.songTitle || readSongMessage('defaultSongTitle');
      const resolvedSource = String(
        persistedAssignment.lyricsSource
        || persistedAssignment.source
        || persistedAssignment.songSource
        || ''
      ).trim();
      const resolvedSourceLabel = resolveSongSourceLabel(
        resolvedSource,
        String(
          persistedAssignment.sourceLabel
          || persistedAssignment.source_label
          || ''
        ).trim()
      );
      if (rosaryModalSongMeta) {
        rosaryModalSongMeta.textContent = `${readSongMessage('sourcePrefix')} ${resolvedSourceLabel}`;
      }
      if (rosaryModalSongExternalActions && rosaryModalSongSpotifyLink && rosaryModalSongYoutubeLink) {
        const externalQuery = buildExternalSongSearchQuery({
          title: persistedAssignment.songTitle || '',
          artist: persistedAssignment.songArtist || '',
        });
        const spotifyUrl = buildExternalSongSearchUrl('spotify', externalQuery);
        const youtubeUrl = buildExternalSongSearchUrl('youtube', externalQuery);

        const setupExternalLink = (node, href, title, ariaLabel) => {
          if (!node) return;
          node.title = title;
          node.setAttribute('aria-label', ariaLabel);
          if (href) {
            node.href = href;
            node.target = '_blank';
            node.rel = 'noopener noreferrer';
            node.classList.remove('is-disabled');
            node.removeAttribute('aria-disabled');
            return;
          }
          node.removeAttribute('href');
          node.removeAttribute('target');
          node.removeAttribute('rel');
          node.classList.add('is-disabled');
          node.setAttribute('aria-disabled', 'true');
        };

        setupExternalLink(
          rosaryModalSongSpotifyLink,
          spotifyUrl,
          readSongMessage('spotifyTitle'),
          readSongMessage('spotifyAria')
        );
        setupExternalLink(
          rosaryModalSongYoutubeLink,
          youtubeUrl,
          readSongMessage('youtubeTitle'),
          readSongMessage('youtubeAria')
        );

        rosaryModalSongExternalActions.hidden = false;
      }
      rosaryModalSongLyrics.textContent = String(persistedAssignment.lyricsText || '').trim()
        || readRosaryMessage('songLyricsEmpty', readMysteryMessage('songLyricsEmpty'));
      rosaryModalSongPanel.hidden = false;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('lyricsLoadError');
      showSongToast(message, 'is-error');
    } finally {
      rosaryModalSongLoading = false;
      updateRosaryModalSongToggleState();
    }
  };

  const resolveMysterySongLyrics = async (assignment) => {
    const safeAssignment = asObject(assignment);
    const cachedLyrics = String(safeAssignment.lyricsText || '');
    if (cachedLyrics.trim()) {
      return safeAssignment;
    }

    const title = String(safeAssignment.songTitle || '').trim();
    const artist = String(safeAssignment.songArtist || '').trim();
    const sourceUrl = String(safeAssignment.songUrl || '').trim();
    if (!title && !sourceUrl) {
      throw new Error(readSongMessage('invalidLyricsTarget'));
    }

    const response = await fetch('/api/songs/fetch-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        artist,
        source_url: sourceUrl,
      }),
    });
    const payload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !payload.ok) {
      const message = payload?.detail?.message
        || payload?.message
        || readSongMessage('lyricsFetchErrorApi');
      const code = payload?.detail?.code || payload?.code || '';
      const error = new Error(message);
      if (code) {
        error.code = code;
      }
      throw error;
    }

    return {
      ...safeAssignment,
      lyricsText: String(payload.lyrics || ''),
      lyricsSource: String(payload.source || safeAssignment.lyricsSource || '').trim(),
      lyricsSourceUrl: String(payload.url || safeAssignment.lyricsSourceUrl || safeAssignment.songUrl || '').trim(),
    };
  };

  const renderMysterySongAssignList = () => {
    if (!mysterySongAssignList) return;
    mysterySongAssignList.innerHTML = '';

    if (!mysterySongGroupsCatalog.length) {
      const emptyNode = document.createElement('p');
      emptyNode.className = 'mystery-song-assign-empty';
      emptyNode.textContent = readMysteryMessage('assignEmpty');
      mysterySongAssignList.appendChild(emptyNode);
      return;
    }

    mysterySongGroupsCatalog.forEach((group) => {
      const groupBlock = document.createElement('section');
      groupBlock.className = 'mystery-song-assign-group';

      const groupTitle = document.createElement('h4');
      groupTitle.className = 'mystery-song-assign-group-title';
      const groupNameNode = document.createElement('span');
      groupNameNode.className = 'mystery-song-assign-group-name';
      groupNameNode.textContent = group.title;
      groupTitle.appendChild(groupNameNode);
      if (group.day) {
        const groupDayNode = document.createElement('span');
        groupDayNode.className = 'mystery-song-assign-group-day';
        groupDayNode.textContent = group.day;
        groupTitle.appendChild(groupDayNode);
      }

      const list = document.createElement('div');
      list.className = 'mystery-song-assign-items';
      group.items.forEach((itemTitle, index) => {
        const itemGroupKey = canonicalMysteryGroupKey(group.title);
        const itemMysteryKey = normalizeKeyToken(itemTitle);
        const existingAssignment = getMysterySongAssignment(group.title, itemTitle);
        const hasAssignedSong = Boolean(existingAssignment.songTitle || existingAssignment.songUrl);
        const itemButton = document.createElement('button');
        itemButton.type = 'button';
        itemButton.className = 'mystery-song-assign-item';
        itemButton.dataset.mysteryGroupKey = itemGroupKey;
        itemButton.dataset.mysteryTitleKey = itemMysteryKey;
        const itemLabel = document.createElement('span');
        itemLabel.className = 'mystery-song-assign-item-label';
        itemLabel.textContent = `${index + 1}º ${itemTitle}`;
        itemButton.appendChild(itemLabel);

        if (hasAssignedSong) {
          itemButton.classList.add('is-assigned');
          const assignedIcon = document.createElement('span');
          assignedIcon.className = 'mystery-song-assign-item-icon';
          assignedIcon.innerHTML = MYSTERY_MUSIC_NOTE_ICON;
          assignedIcon.setAttribute('aria-hidden', 'true');
          itemButton.appendChild(assignedIcon);

          const assignedSongTitle = String(existingAssignment.songTitle || '').trim();
          if (assignedSongTitle) {
            itemButton.title = readMysteryMessage('assignCurrentSongTitle',
              { title: assignedSongTitle }
            );
          }
        }

        itemButton.addEventListener('click', async () => {
          const song = asObject(mysterySongAssignPendingSong);
          if (!song.title && !song.url) {
            showSongToast(
              readMysteryMessage('assignSongInvalid'),
              'is-error'
            );
            return;
          }
          if (!ensureSongShareImportForMutations(itemButton)) {
            return;
          }

          const currentAssignment = getMysterySongAssignment(group.title, itemTitle);
          const hasCurrentAssignment = Boolean(currentAssignment.songTitle || currentAssignment.songUrl);
          const refreshAssignListAfterMutation = () => {
            const previousScrollTop = mysterySongAssignList ? mysterySongAssignList.scrollTop : 0;
            renderMysterySongAssignList();
            if (mysterySongAssignList) {
              mysterySongAssignList.scrollTop = previousScrollTop;
              const updatedButton = Array.from(
                mysterySongAssignList.querySelectorAll('.mystery-song-assign-item')
              ).find((node) => (
                node instanceof HTMLElement
                && node.dataset.mysteryGroupKey === itemGroupKey
                && node.dataset.mysteryTitleKey === itemMysteryKey
              ));
              if (updatedButton instanceof HTMLElement) {
                window.requestAnimationFrame(() => {
                  focusWithoutScrollingPage(updatedButton);
                });
              }
            }
          };

          if (hasCurrentAssignment) {
            const currentSongTitle = String(currentAssignment.songTitle || '').trim()
              || readSongMessage('defaultSongTitle');
            const nextSongTitle = String(song.title || '').trim()
              || readSongMessage('defaultSongTitle');
            const removeMessage = readMysteryMessage('assignRemoveConfirmMessageWithTitle',
              { title: currentSongTitle }
            );
            const existingAction = await openFavoriteDecisionModal({
              triggerElement: itemButton,
              title: readMysteryMessage('assignExistingChoiceTitle'),
              message: readMysteryMessage('assignExistingChoiceMessage',
                { current: currentSongTitle, next: nextSongTitle }
              ),
              cancelLabel: readMysteryMessage('assignExistingChoiceRemove'),
              acceptLabel: readMysteryMessage('assignExistingChoiceReplace'),
              fallbackCancelConfirmMessage: removeMessage,
            });
            if (existingAction === FAVORITE_CONFIRM_ACTION_DISMISS) return;

            if (existingAction === FAVORITE_CONFIRM_ACTION_CANCEL) {
              try {
                await deleteMysterySongAssignmentOnServer(group.title, itemTitle);
              } catch (err) {
                const message = err instanceof Error
                  ? err.message
                  : readMysteryMessage('assignRemoveError');
                showSongToast(message, 'is-error');
                return;
              }

              if (
                canonicalMysteryGroupKey(group.title) === canonicalMysteryGroupKey(currentMysteryModalSelection.group)
                && normalizeMysteryName(itemTitle) === normalizeMysteryName(currentMysteryModalSelection.title)
              ) {
                closeMysterySongPanel();
                updateMysteryModalSongToggleState();
              }

              refreshAssignListAfterMutation();
              renderSongSaveLocationPicker();
              renderSongFavorites();
              leaveSongShareViewModeAfterMutation();
              showSongToast(
                readMysteryMessage('assignRemoveSuccess'),
                'is-success'
              );
              return;
            }
          }

          try {
            await saveMysterySongAssignmentOnServer(group.title, itemTitle, {
              songTitle: String(song.title || '').trim(),
              songArtist: String(song.artist || '').trim(),
              songUrl: String(song.url || '').trim(),
              source: String(song.source || '').trim(),
              sourceLabel: resolveSongSourceLabel(
                String(song.source || '').trim(),
                String(song.source_label || '').trim()
              ),
              imageUrl: String(song.image_url || '').trim(),
              lyricsText: '',
              lyricsSource: '',
              lyricsSourceUrl: '',
              groupDay: group.day,
            });
          } catch (err) {
            const message = err instanceof Error
              ? err.message
              : readMysteryMessage('assignSaveError');
            showSongToast(message, 'is-error');
            return;
          }
          if (
            canonicalMysteryGroupKey(group.title) === canonicalMysteryGroupKey(currentMysteryModalSelection.group)
            && normalizeMysteryName(itemTitle) === normalizeMysteryName(currentMysteryModalSelection.title)
          ) {
            closeMysterySongPanel();
            updateMysteryModalSongToggleState();
          }
          refreshAssignListAfterMutation();
          renderSongSaveLocationPicker();
          renderSongFavorites();
          leaveSongShareViewModeAfterMutation();
          showSongToast(
            readMysteryMessage('assignSuccess'),
            'is-success'
          );
        });
        list.appendChild(itemButton);
      });

      groupBlock.appendChild(groupTitle);
      groupBlock.appendChild(list);
      mysterySongAssignList.appendChild(groupBlock);
    });
  };

  function closeMysterySongAssignModal() {
    if (!mysterySongAssignModal) return;
    const focusTarget = lastFocusedMysterySongAssignTrigger instanceof HTMLElement
      ? lastFocusedMysterySongAssignTrigger
      : null;
    mysterySongAssignModal.classList.remove('open');
    mysterySongAssignModal.setAttribute('aria-hidden', 'true');
    mysterySongAssignPendingSong = null;
    syncBodyModalLock();
    if (!hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedMysterySongAssignTrigger = null;
  }

  const openMysterySongAssignModal = (songPayload, triggerButton = null) => {
    if (!mysterySongAssignModal || !mysterySongAssignList) {
      showSongToast(
        readMysteryMessage('assignModalUnavailable'),
        'is-error'
      );
      return;
    }

    const song = asObject(songPayload);
    const title = String(song.title || '').trim() || readSongMessage('defaultSongTitle');
    const artist = String(song.artist || '').trim();
    mysterySongAssignPendingSong = song;
    lastFocusedMysterySongAssignTrigger = triggerButton instanceof HTMLElement
      ? triggerButton
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    if (mysterySongAssignSong) {
      mysterySongAssignSong.textContent = artist ? `${title} - ${artist}` : title;
    }
    renderMysterySongAssignList();

    mysterySongAssignModal.classList.add('open');
    mysterySongAssignModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    window.requestAnimationFrame(() => {
      const firstAction = mysterySongAssignList.querySelector('.mystery-song-assign-item');
      if (firstAction instanceof HTMLElement) {
        focusWithoutScrollingPage(firstAction);
      }
    });
  };

  const resolveMysteryGroupTitle = (group) => {
    const rawGroup = (group || '').trim();
    if (!rawGroup) return readMysteryMessage('groupFallback');
    if (mysteryItemsByGroup[rawGroup]) return rawGroup;

    const normalized = rawGroup
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('gozoso')) return readMysteryMessage('groupGozosos');
    if (normalized.includes('doloroso')) return readMysteryMessage('groupDolorosos');
    if (normalized.includes('glorioso')) return readMysteryMessage('groupGloriosos');
    if (normalized.includes('luminoso')) return readMysteryMessage('groupLuminosos');
    return rawGroup || readMysteryMessage('unknownGroup');
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
      link.textContent = readMysteryMessage('modalLinkLabel', { index: index + 1 });
      link.dataset.shortLabel = String(index + 1);
      link.title = itemTitle;
      link.setAttribute('aria-label', readMysteryMessage('modalLinkAria', {
        index: index + 1,
        title: itemTitle
      }));

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

  const getPreferredMysteryGroups = () => ([
    readMysteryMessage('groupGozosos'),
    readMysteryMessage('groupDolorosos'),
    readMysteryMessage('groupGloriosos'),
    readMysteryMessage('groupLuminosos'),
  ]);

  const resolveExistingMysteryGroupKey = (groupLabel) => {
    const rawGroup = String(groupLabel || '').trim();
    if (!rawGroup) return '';
    if (mysteryItemsByGroup[rawGroup]) return rawGroup;
    const normalizedTarget = normalizeKeyToken(rawGroup);
    if (!normalizedTarget) return '';
    const matchedGroup = Object.keys(mysteryItemsByGroup).find(
      (candidate) => normalizeKeyToken(candidate) === normalizedTarget
    );
    return matchedGroup || '';
  };

  const getOrderedMysteryGroups = () => {
    const orderedGroups = [];
    const includedKeys = new Set();
    const pushGroupIfAvailable = (groupLabel) => {
      const resolvedGroup = resolveExistingMysteryGroupKey(groupLabel);
      if (!resolvedGroup) return;
      if (includedKeys.has(resolvedGroup)) return;
      const items = mysteryItemsByGroup[resolvedGroup] || [];
      if (!Array.isArray(items) || !items.length) return;
      includedKeys.add(resolvedGroup);
      orderedGroups.push(resolvedGroup);
    };

    getPreferredMysteryGroups().forEach(pushGroupIfAvailable);
    Object.keys(mysteryItemsByGroup).forEach(pushGroupIfAvailable);
    return orderedGroups;
  };

  const closeMysteryGroupModal = (options = {}) => {
    const safeOptions = asObject(options);
    if (mysteryGroupModal) {
      mysteryGroupModal.classList.remove('open');
      mysteryGroupModal.setAttribute('aria-hidden', 'true');
    }
    if (mysteryModalGroup) {
      mysteryModalGroup.setAttribute('aria-expanded', 'false');
      mysteryModalGroup.classList.remove('is-active');
      if (safeOptions.restoreFocus) {
        focusWithoutScrollingPage(mysteryModalGroup);
      }
    }
    syncBodyModalLock();
  };

  const openMysteryFromGroupKeepingIndex = (nextGroup) => {
    const safeNextGroup = String(nextGroup || '').trim();
    const resolvedNextGroup = resolveExistingMysteryGroupKey(safeNextGroup)
      || resolveExistingMysteryGroupKey(resolveMysteryGroupTitle(safeNextGroup));
    const currentGroup = resolveExistingMysteryGroupKey(currentMysteryModalSelection.group || '');
    closeMysteryGroupModal();
    if (!safeNextGroup || !resolvedNextGroup || !currentGroup) return;
    const currentGroupItems = mysteryItemsByGroup[currentGroup] || [];
    const nextGroupItems = mysteryItemsByGroup[resolvedNextGroup] || [];
    if (!nextGroupItems.length) return;
    const currentIndex = currentGroupItems.findIndex(
      (itemTitle) => normalizeKeyToken(itemTitle) === normalizeKeyToken(currentMysteryModalSelection.title)
    );
    const targetIndex = currentIndex >= 0
      ? Math.min(currentIndex, nextGroupItems.length - 1)
      : 0;
    const nextTitle = nextGroupItems[targetIndex] || nextGroupItems[0];
    if (!nextTitle) return;
    openMysteryModal(nextTitle, resolvedNextGroup);
  };

  const renderMysteryGroupModalOptions = () => {
    if (!mysteryGroupModalOptions) return;
    mysteryGroupModalOptions.innerHTML = '';
    const currentGroupToken = normalizeKeyToken(currentMysteryModalSelection.group || '');

    getPreferredMysteryGroups().forEach((groupLabel) => {
      const resolvedGroup = resolveExistingMysteryGroupKey(groupLabel);
      const hasItems = Boolean(resolvedGroup && Array.isArray(mysteryItemsByGroup[resolvedGroup]) && mysteryItemsByGroup[resolvedGroup].length);
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'mystery-group-modal-option';
      optionButton.textContent = groupLabel;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute(
        'aria-label',
        readMysteryMessage('groupOptionAria', { group: groupLabel })
      );
      if (!hasItems) {
        optionButton.disabled = true;
        optionButton.classList.add('is-disabled');
      } else {
        if (normalizeKeyToken(resolvedGroup) === currentGroupToken) {
          optionButton.classList.add('is-active');
          optionButton.setAttribute('aria-selected', 'true');
        } else {
          optionButton.setAttribute('aria-selected', 'false');
        }
        optionButton.addEventListener('click', () => {
          openMysteryFromGroupKeepingIndex(resolvedGroup);
        });
      }
      mysteryGroupModalOptions.appendChild(optionButton);
    });
  };

  const openMysteryGroupModal = () => {
    if (!mysteryModal || !mysteryModal.classList.contains('open')) return;
    if (!mysteryGroupModal) return;
    if (getOrderedMysteryGroups().length <= 1) return;
    renderMysteryGroupModalOptions();
    mysteryGroupModal.classList.add('open');
    mysteryGroupModal.setAttribute('aria-hidden', 'false');
    if (mysteryModalGroup) {
      mysteryModalGroup.setAttribute('aria-expanded', 'true');
      mysteryModalGroup.classList.add('is-active');
    }
    syncBodyModalLock();

    window.requestAnimationFrame(() => {
      const activeOption = mysteryGroupModalOptions?.querySelector('.mystery-group-modal-option.is-active:not(:disabled)');
      if (activeOption instanceof HTMLElement) {
        focusWithoutScrollingPage(activeOption);
        return;
      }
      const firstOption = mysteryGroupModalOptions?.querySelector('.mystery-group-modal-option:not(:disabled)');
      if (firstOption instanceof HTMLElement) {
        focusWithoutScrollingPage(firstOption);
      }
    });
  };

  const toggleMysteryGroupModal = () => {
    if (!mysteryGroupModal) return;
    if (getOrderedMysteryGroups().length <= 1) return;
    if (!mysteryGroupModal.classList.contains('open')) {
      openMysteryGroupModal();
      return;
    }
    closeMysteryGroupModal({ restoreFocus: true });
  };

  const syncMysteryGroupSwitchState = () => {
    if (!mysteryModalGroup) return;
    const hasMultipleGroups = getOrderedMysteryGroups().length > 1;
    mysteryModalGroup.classList.toggle('is-switchable', hasMultipleGroups);
    if (!hasMultipleGroups) {
      closeMysteryGroupModal();
      mysteryModalGroup.removeAttribute('role');
      mysteryModalGroup.removeAttribute('tabindex');
      mysteryModalGroup.removeAttribute('title');
      mysteryModalGroup.removeAttribute('aria-label');
      mysteryModalGroup.removeAttribute('aria-haspopup');
      mysteryModalGroup.removeAttribute('aria-expanded');
      return;
    }
    mysteryModalGroup.setAttribute('role', 'button');
    mysteryModalGroup.setAttribute('tabindex', '0');
    mysteryModalGroup.setAttribute(
      'title',
      readMysteryMessage('groupSwitchHint')
    );
    mysteryModalGroup.setAttribute(
      'aria-label',
      readMysteryMessage('groupSwitchAria')
    );
    mysteryModalGroup.setAttribute('aria-haspopup', 'dialog');
    if (!mysteryModalGroup.hasAttribute('aria-expanded')) {
      mysteryModalGroup.setAttribute('aria-expanded', 'false');
    }
  };

  let modalLockedScrollX = 0;
  let modalLockedScrollY = 0;
  const MODAL_OPEN_SELECTOR = '.mystery-modal.open, .mystery-group-modal.open, .rosary-modal.open, .song-modal.open, .favorite-confirm-modal.open, .custom-song-modal.open, .mystery-song-assign-modal.open, .song-save-location-picker.open, .song-location-create-modal.open, .auth-modal.open, .auth-sessions-modal.open, .song-share-modal.open, .song-share-merge-modal.open';

  const runWithInstantScrollBehavior = (callback) => {
    if (typeof callback !== 'function') return;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    try {
      callback();
    } finally {
      if (previousBehavior) {
        root.style.scrollBehavior = previousBehavior;
      } else {
        root.style.removeProperty('scroll-behavior');
      }
    }
  };

  const restoreModalLockedWindowScroll = () => {
    runWithInstantScrollBehavior(() => {
      window.scrollTo(modalLockedScrollX, modalLockedScrollY);
    });
  };

  const hasAnyOpenModal = () => Boolean(document.querySelector(MODAL_OPEN_SELECTOR));

  const focusWithoutScrollingPage = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!element.isConnected) return;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      element.focus();
    }
  };

  const lockBodyModalScroll = () => {
    if (document.body.classList.contains('has-modal-open')) return;
    modalLockedScrollX = window.scrollX || window.pageXOffset || 0;
    modalLockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.setProperty('--modal-lock-scroll-y', `-${modalLockedScrollY}px`);
    document.documentElement.classList.add('has-modal-open');
    document.body.classList.add('has-modal-open');
  };

  const unlockBodyModalScroll = () => {
    if (!document.body.classList.contains('has-modal-open')) return;
    document.documentElement.classList.remove('has-modal-open');
    document.body.classList.remove('has-modal-open');
    document.body.style.removeProperty('--modal-lock-scroll-y');
    restoreModalLockedWindowScroll();
    window.requestAnimationFrame(() => {
      restoreModalLockedWindowScroll();
    });
  };

  const syncBodyModalLock = () => {
    if (hasAnyOpenModal()) {
      lockBodyModalScroll();
      return;
    }
    unlockBodyModalScroll();
  };

  const clearMysteryAveMariaAutoJaculatoryTimer = () => {
    if (mysteryAveMariaAutoJaculatoryTimerId === null) return;
    window.clearTimeout(mysteryAveMariaAutoJaculatoryTimerId);
    mysteryAveMariaAutoJaculatoryTimerId = null;
  };

  const setMysteryJaculatoryVisible = (visible) => {
    if (!mysteryJaculatoryToggle || !mysteryJaculatoryPanel) return;
    if (visible) {
      clearMysteryAveMariaAutoJaculatoryTimer();
    }
    if (mysteryModal) {
      mysteryModal.classList.toggle('is-jaculatory-focus', Boolean(visible));
    }

    mysteryJaculatoryPanel.hidden = !visible;
    mysteryJaculatoryToggle.hidden = visible;
    mysteryJaculatoryToggle.setAttribute('aria-expanded', String(visible));
    mysteryJaculatoryToggle.setAttribute('aria-hidden', String(visible));
    mysteryJaculatoryToggle.classList.remove('is-active');
    mysteryJaculatoryToggle.textContent = readMysteryMessage('toggleShow');
  };

  const setMysteryAveMariaStep = (step) => {
    clearMysteryAveMariaAutoJaculatoryTimer();
    if (!mysteryAveMariaOptions) return;
    const parsed = Number.parseInt(String(step ?? 0), 10);
    const safeStep = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 0;
    mysteryAveMariaCurrent = safeStep;
    const optionButtons = Array.from(mysteryAveMariaOptions.querySelectorAll('.mystery-ave-maria-option'));
    optionButtons.forEach((button, index) => {
      const value = index + 1;
      const isComplete = safeStep > 0 && value <= safeStep;
      const isActive = value === safeStep;
      button.classList.toggle('is-complete', isComplete);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isComplete));
      if (isActive) {
        button.setAttribute('aria-current', 'step');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    if (safeStep !== 10) return;
    mysteryAveMariaAutoJaculatoryTimerId = window.setTimeout(() => {
      mysteryAveMariaAutoJaculatoryTimerId = null;
      if (!mysteryModal || !mysteryModal.classList.contains('open')) return;
      if (mysteryAveMariaCurrent !== 10) return;
      if (!mysteryJaculatoryPanel || !mysteryJaculatoryPanel.hidden) return;
      setMysteryJaculatoryVisible(true);
    }, MYSTERY_AVE_MARIA_AUTO_JACULATORY_DELAY_MS);
  };

  const renderMysteryAveMariaOptions = () => {
    if (!mysteryAveMariaOptions) return;
    mysteryAveMariaOptions.innerHTML = '';
    for (let index = 1; index <= 10; index += 1) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'mystery-ave-maria-option';
      optionButton.textContent = String(index);
      optionButton.setAttribute(
        'aria-label',
        readMysteryMessage('aveMariaOptionAria', { index })
      );
      optionButton.setAttribute('title', readMysteryMessage('aveMariaOptionTitle', { index }));
      optionButton.setAttribute('aria-pressed', 'false');
      optionButton.addEventListener('click', () => {
        setMysteryAveMariaStep(index);
      });
      mysteryAveMariaOptions.appendChild(optionButton);
    }
    setMysteryAveMariaStep(0);
  };
  renderMysteryAveMariaOptions();

  const toggleMysteryModalSongPanel = async () => {
    if (!mysteryModalSongPanel || !mysteryModalSongTitle || !mysteryModalSongLyrics) return;
    const assignment = getMysterySongAssignment(
      currentMysteryModalSelection.group,
      currentMysteryModalSelection.title
    );
    if (!assignment.songTitle && !assignment.songUrl) {
      showSongToast(
        readMysteryMessage('songToggleEmpty'),
        'is-warning'
      );
      return;
    }

    const isOpen = !mysteryModalSongPanel.hidden;
    if (isOpen) {
      closeMysterySongPanel();
      updateMysteryModalSongToggleState();
      return;
    }

    mysteryModalSongLoading = true;
    updateMysteryModalSongToggleState();
    try {
      const resolvedAssignment = await resolveMysterySongLyrics(assignment);
      let persistedAssignment = resolvedAssignment;
      const shouldPersistAssignment = Boolean(!songShareViewModeLoaded && isAuthLoggedIn());
      if (shouldPersistAssignment) {
        try {
          persistedAssignment = await saveMysterySongAssignmentOnServer(
            currentMysteryModalSelection.group,
            currentMysteryModalSelection.title,
            resolvedAssignment
          );
        } catch (saveErr) {
          persistedAssignment = cacheMysterySongAssignment({
            ...resolvedAssignment,
            groupTitle: currentMysteryModalSelection.group,
            mysteryTitle: currentMysteryModalSelection.title,
          }) || resolvedAssignment;
        }
      } else {
        persistedAssignment = cacheMysterySongAssignment({
          ...resolvedAssignment,
          groupTitle: currentMysteryModalSelection.group,
          mysteryTitle: currentMysteryModalSelection.title,
        }) || resolvedAssignment;
      }
      mysteryModalSongTitle.textContent = persistedAssignment.songArtist
        ? `${persistedAssignment.songTitle} - ${persistedAssignment.songArtist}`
        : persistedAssignment.songTitle || readSongMessage('defaultSongTitle');
      mysteryModalSongLyrics.textContent = String(persistedAssignment.lyricsText || '').trim()
        || readMysteryMessage('songLyricsEmpty');
      mysteryModalSongPanel.hidden = false;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('lyricsLoadError');
      showSongToast(message, 'is-error');
    } finally {
      mysteryModalSongLoading = false;
      updateMysteryModalSongToggleState();
    }
  };

  const openMysteryModal = (title, group) => {
    if (!mysteryModal || !mysteryModalTitle || !mysteryModalText || !mysteryModalGroup) return;

    ensureMysteryNavBeforeTitle();
    closeMysteryGroupModal();
    const shouldResetJaculatory = !mysteryModal.classList.contains('open');
    const resolvedGroup = resolveMysteryGroupTitle(group);
    const meditation = mysteryMeditations[title]
      || readMysteryMessage('emptyMeditation');
    mysteryModalTitle.textContent = title;
    mysteryModalText.textContent = meditation;
    mysteryModalGroup.textContent = resolvedGroup;
    currentMysteryModalSelection = {
      title: normalizeMysteryName(title),
      group: resolvedGroup,
    };
    mysteryModalSongLoading = false;
    closeMysterySongPanel();
    updateMysteryModalSongToggleState();
    void fetchMysterySongAssignments();
    renderMysteryModalLinks(resolvedGroup, title);
    syncMysteryGroupSwitchState();
    setMysteryAveMariaStep(0);
    if (shouldResetJaculatory) {
      setMysteryJaculatoryVisible(false);
    }
    mysteryModal.classList.add('open');
    mysteryModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
  };

  const closeMysteryModal = () => {
    if (!mysteryModal) return;
    const focusTarget = lastFocusedMystery instanceof HTMLElement ? lastFocusedMystery : null;
    mysteryModal.classList.remove('open');
    mysteryModal.setAttribute('aria-hidden', 'true');
    closeMysteryGroupModal();
    setMysteryJaculatoryVisible(false);
    closeMysterySongPanel();
    mysteryModalSongLoading = false;
    updateMysteryModalSongToggleState();
    setMysteryAveMariaStep(0);
    syncBodyModalLock();
    if (!hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedMystery = null;
  };

  const clampRosaryStepIndex = (index) => {
    const maxIndex = Math.max(0, rosaryFlowSteps.length - 1);
    const parsedIndex = Number.parseInt(String(index ?? 0), 10);
    if (!Number.isInteger(parsedIndex)) return 0;
    return Math.min(maxIndex, Math.max(0, parsedIndex));
  };

  const getRosaryFlowStep = () => rosaryFlowSteps[clampRosaryStepIndex(rosaryModalStepIndex)] || null;
  const isRosaryMysteriesStep = (step) => (
    asObject(step).actionType === 'open_today_mysteries'
  );

  const renderRosaryModalDots = () => {
    if (!rosaryModalDots) return;
    rosaryModalDots.innerHTML = '';
    const currentIndex = clampRosaryStepIndex(rosaryModalStepIndex);

    rosaryFlowSteps.forEach((step, index) => {
      const safeStep = asObject(step);
      const dotNumber = String(safeStep.dotNumber || (index + 1));
      const dotButton = document.createElement('button');
      dotButton.type = 'button';
      dotButton.className = 'rosary-modal-dot';
      dotButton.textContent = dotNumber;
      dotButton.title = safeStep.dotLabel || safeStep.title || '';
      dotButton.setAttribute(
        'aria-label',
        readRosaryMessage('dotAria', {
          index: dotNumber,
          title: safeStep.dotLabel || safeStep.title || ''
        })
      );
      if (index === currentIndex) {
        dotButton.classList.add('is-active');
        dotButton.setAttribute('aria-current', 'step');
      } else if (index < currentIndex) {
        dotButton.classList.add('is-completed');
      }
      dotButton.addEventListener('click', () => {
        rosaryModalStepIndex = index;
        renderRosaryModalStep();
        if (isRosaryMysteriesStep(step)) {
          openTodayMysteriesFromRosary();
        }
      });
      rosaryModalDots.appendChild(dotButton);
    });
  };

  const renderRosaryModalStep = () => {
    if (!rosaryModal || !rosaryModalTitle || !rosaryModalGroup || !rosaryModalStepText) return;
    if (!rosaryFlowSteps.length) return;

    rosaryModalStepIndex = clampRosaryStepIndex(rosaryModalStepIndex);
    const currentStep = getRosaryFlowStep();
    if (!currentStep) return;

    const stepGroup = String(currentStep.group || '').trim() || readRosaryMessage('stepFallbackGroup');
    const shouldHideStepTitle = currentStep.hideTitle === true;
    const stepTitle = shouldHideStepTitle
      ? ''
      : (String(currentStep.title || '').trim() || readRosaryMessage('stepFallbackTitle'));
    const stepText = String(currentStep.text || '').trim();
    const totalSteps = rosaryFlowSteps.length;
    const currentStepNumber = rosaryModalStepIndex + 1;

    rosaryModalGroup.textContent = stepGroup;
    rosaryModalTitle.textContent = stepTitle;
    rosaryModalTitle.hidden = shouldHideStepTitle;
    rosaryModalTitle.setAttribute('aria-hidden', shouldHideStepTitle ? 'true' : 'false');
    rosaryModalStepText.textContent = stepText || readRosaryMessage('stepFallbackText');
    if (rosaryModalStepCounter) {
      rosaryModalStepCounter.textContent = readRosaryMessage('stepCounter', {
        current: currentStepNumber,
        total: totalSteps
      });
    }

    if (rosaryModalPrevBtn) {
      rosaryModalPrevBtn.disabled = rosaryModalStepIndex <= 0;
    }
    if (rosaryModalNextBtn) {
      const isLastStep = rosaryModalStepIndex >= (totalSteps - 1);
      rosaryModalNextBtn.textContent = isLastStep
        ? readRosaryMessage('finishButton')
        : readRosaryMessage('nextButton');
    }

    closeRosarySongPanel();
    rosaryModalSongLoading = false;
    updateRosaryModalSongToggleState();
    renderRosaryModalDots();
  };

  const goToRosaryStep = (direction) => {
    const safeDirection = Number.parseInt(String(direction || 0), 10);
    if (!Number.isInteger(safeDirection) || safeDirection === 0) return;
    rosaryModalStepIndex = clampRosaryStepIndex(rosaryModalStepIndex + safeDirection);
    renderRosaryModalStep();
    const currentStep = getRosaryFlowStep();
    if (safeDirection > 0 && isRosaryMysteriesStep(currentStep)) {
      openTodayMysteriesFromRosary();
    }
  };

  const closeRosaryModal = (options = {}) => {
    if (!rosaryModal) return;
    const shouldRestoreFocus = options?.restoreFocus !== false;
    const focusTarget = lastFocusedRosaryTrigger instanceof HTMLElement
      ? lastFocusedRosaryTrigger
      : null;
    rosaryModal.classList.remove('open');
    rosaryModal.setAttribute('aria-hidden', 'true');
    closeRosarySongPanel();
    rosaryModalSongLoading = false;
    updateRosaryModalSongToggleState();
    syncBodyModalLock();
    if (shouldRestoreFocus && !hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedRosaryTrigger = null;
  };

  const openRosaryModal = (trigger = null, options = {}) => {
    if (!rosaryModal || !rosaryFlowSteps.length) return;
    lastFocusedRosaryTrigger = trigger instanceof HTMLElement
      ? trigger
      : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    rosaryModalStepIndex = clampRosaryStepIndex(options?.startStepIndex ?? 0);
    renderRosaryModalStep();
    rosaryModal.classList.add('open');
    rosaryModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    void Promise.allSettled([
      fetchSongLocationTree(),
      fetchSongLocationAssignments(),
    ]).then(() => {
      if (!rosaryModal.classList.contains('open')) return;
      updateRosaryModalSongToggleState();
    });

    window.requestAnimationFrame(() => {
      const activeDot = rosaryModalDots?.querySelector('.rosary-modal-dot.is-active');
      if (activeDot instanceof HTMLElement) {
        focusWithoutScrollingPage(activeDot);
        return;
      }
      if (rosaryModalNextBtn instanceof HTMLElement) {
        focusWithoutScrollingPage(rosaryModalNextBtn);
      }
    });
  };

  const openTodayMysteriesFromRosary = () => {
    const daySlot = resolveTodayMysterySlot() || {};
    const groupTitle = String(daySlot.title || '').trim();
    const dayItems = Array.isArray(daySlot.items) ? daySlot.items : [];
    const firstMysteryTitle = normalizeMysteryName(dayItems[0] || '');

    if (groupTitle && firstMysteryTitle) {
      lastFocusedMystery = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      openMysteryModal(firstMysteryTitle, groupTitle);
      return;
    }

    showSongToast(
      readRosaryMessage('todayMysteriesFallback'),
      'is-warning'
    );
  };

  const bindMysteryItem = (element) => {
    if (!element || element.dataset.mysteryBound === '1') return;

    element.dataset.mysteryBound = '1';
    element.classList.add('mystery-interactive');
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');

    const handleOpen = () => {
      const title = element.textContent.trim().replace(/^\d+\s*[ºo]\s+/i, '');
      const fallbackGroup = element.closest('.mystery-card')?.querySelector('h3')?.textContent?.trim();
      const group = element.dataset.mysteryGroup || fallbackGroup || readMysteryMessage('groupFallback');
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
  if (mysteryModalGroup) {
    mysteryModalGroup.addEventListener('click', () => {
      if (!mysteryModal.classList.contains('open')) return;
      toggleMysteryGroupModal();
    });
    mysteryModalGroup.addEventListener('keydown', (event) => {
      if (!mysteryModal.classList.contains('open')) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      openMysteryGroupModal();
    });
  }
  if (mysteryGroupModalCloseButtons.length) {
    mysteryGroupModalCloseButtons.forEach((button) => {
      button.addEventListener('click', () => closeMysteryGroupModal({ restoreFocus: true }));
    });
  }
  if (rosaryModalCloseButtons.length) {
    rosaryModalCloseButtons.forEach((button) => {
      button.addEventListener('click', () => closeRosaryModal());
    });
  }
  if (rosaryModalPrevBtn) {
    rosaryModalPrevBtn.addEventListener('click', () => {
      goToRosaryStep(-1);
    });
  }
  if (rosaryModalNextBtn) {
    rosaryModalNextBtn.addEventListener('click', () => {
      if (rosaryModalStepIndex >= (rosaryFlowSteps.length - 1)) {
        closeRosaryModal();
        return;
      }
      goToRosaryStep(1);
    });
  }
  if (rosaryModalTriggers.length) {
    rosaryModalTriggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openRosaryModal(trigger);
      });
    });
  }
  if (rosaryModalSongToggle) {
    rosaryModalSongToggle.addEventListener('click', () => {
      void toggleRosaryModalSongPanel();
    });
    updateRosaryModalSongToggleState();
  }
  if (rosaryModalSongClose) {
    rosaryModalSongClose.addEventListener('click', () => {
      closeRosarySongPanel();
      updateRosaryModalSongToggleState();
    });
  }

  if (mysteryJaculatoryToggle) {
    mysteryJaculatoryToggle.addEventListener('click', () => {
      setMysteryJaculatoryVisible(Boolean(mysteryJaculatoryPanel?.hidden));
    });
  }

  if (mysteryJaculatoryClose) {
    mysteryJaculatoryClose.addEventListener('click', () => {
      setMysteryJaculatoryVisible(false);
    });
  }
  if (mysteryModalSongToggle) {
    mysteryModalSongToggle.addEventListener('click', () => {
      void toggleMysteryModalSongPanel();
    });
    updateMysteryModalSongToggleState();
  }
  if (mysteryModalSongClose) {
    mysteryModalSongClose.addEventListener('click', () => {
      closeMysterySongPanel();
      updateMysteryModalSongToggleState();
    });
  }
  if (mysterySongAssignCloseButtons.length) {
    mysterySongAssignCloseButtons.forEach((button) => {
      button.addEventListener('click', closeMysterySongAssignModal);
    });
  }
  if (songSaveLocationPickerCloseBtn) {
    songSaveLocationPickerCloseBtn.addEventListener('click', () => {
      closeSongSaveLocationPicker();
    });
  }
  if (songSaveLocationPickerSearchInput) {
    const handleSongSaveLocationSearchChange = () => {
      songSaveLocationPickerSearchQuery = String(songSaveLocationPickerSearchInput.value || '');
      renderSongSaveLocationPicker();
      positionSongSaveLocationPicker();
    };
    songSaveLocationPickerSearchInput.addEventListener('input', handleSongSaveLocationSearchChange);
    songSaveLocationPickerSearchInput.addEventListener('search', handleSongSaveLocationSearchChange);
  }
  if (songSaveLocationPickerBackBtn) {
    songSaveLocationPickerBackBtn.addEventListener('click', () => {
      if (songSaveLocationPickerPath.length <= songSaveLocationPickerBaseDepth) return;
      songSaveLocationPickerPath.pop();
      renderSongSaveLocationPicker();
      positionSongSaveLocationPicker();
    });
  }
  if (songSaveLocationPickerAddBtn) {
    songSaveLocationPickerAddBtn.addEventListener('click', () => {
      const parentId = String(songSaveLocationPickerAddBtn.dataset.parentId || '').trim();
      const parentLabel = String(songSaveLocationPickerAddBtn.dataset.parentLabel || '').trim();
      openSongLocationCreateModal(parentId, parentLabel, songSaveLocationPickerAddBtn);
    });
  }
  if (songLocationCreateCloseButtons.length) {
    songLocationCreateCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeSongLocationCreateModal();
      });
    });
  }
  if (songLocationCreateAcceptBtn) {
    songLocationCreateAcceptBtn.addEventListener('click', () => {
      void submitSongLocationCreateModal();
    });
  }
  if (songLocationCreateParentInput) {
    const handleSongLocationCreateParentChange = () => {
      syncSongLocationCreateModalTargetState();
      renderSongLocationCreateParentPickerTree();
      if (!songLocationCreateModalSubmitting) {
        openSongLocationCreateParentPicker();
      }
    };
    songLocationCreateParentInput.addEventListener('input', handleSongLocationCreateParentChange);
    songLocationCreateParentInput.addEventListener('change', () => {
      syncSongLocationCreateModalTargetState();
    });
    songLocationCreateParentInput.addEventListener('click', () => {
      if (songLocationCreateModalSubmitting) return;
      if (
        songLocationCreateParentInput.value.trim()
        && String(songLocationCreateParentIdInput?.value || '').trim()
      ) {
        songLocationCreateParentInput.value = '';
        if (songLocationCreateParentIdInput) {
          songLocationCreateParentIdInput.value = '';
        }
        songLocationCreateModalParentId = '';
        songLocationCreateModalParentLabel = '';
        syncSongLocationCreateModalTargetState();
      }
      renderSongLocationCreateParentPickerTree();
      openSongLocationCreateParentPicker();
    });
    songLocationCreateParentInput.addEventListener('focus', () => {
      if (songLocationCreateModalSubmitting) return;
      renderSongLocationCreateParentPickerTree();
      openSongLocationCreateParentPicker();
    });
    songLocationCreateParentInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSongLocationCreateParentPicker();
      }
    });
  }
  document.addEventListener('mousedown', (event) => {
    if (!isSongLocationCreateModalOpen() || !isSongLocationCreateParentPickerOpen()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    const clickedInsideInput = Boolean(
      songLocationCreateParentInput
      && songLocationCreateParentInput.contains(target)
    );
    const clickedInsidePicker = Boolean(
      songLocationCreateParentPicker
      && songLocationCreateParentPicker.contains(target)
    );
    if (clickedInsideInput || clickedInsidePicker) return;
    closeSongLocationCreateParentPicker();
  });
  if (songLocationCreateModal) {
    songLocationCreateModal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isSongLocationCreateParentPickerOpen()) {
        event.preventDefault();
        event.stopPropagation();
        closeSongLocationCreateParentPicker();
      }
    });
  }
  if (songLocationCreateInput) {
    songLocationCreateInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void submitSongLocationCreateModal();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSongLocationCreateModal();
      }
    });
  }

  const daySlot = resolveTodayMysterySlot();
  const titleEl = document.getElementById('today-mystery-title');
  const dayEl = document.getElementById('today-mystery-day');
  const listEl = document.getElementById('today-mystery-list');

  if (daySlot && titleEl && dayEl && listEl) {
    titleEl.textContent = daySlot.title;
    dayEl.textContent = daySlot.day;
    listEl.innerHTML = '';
    daySlot.items.forEach((item, itemIndex) => {
      const li = document.createElement('li');
      li.textContent = formatMysteryItemLabel(item, itemIndex);
      li.dataset.mysteryGroup = daySlot.title;
      listEl.appendChild(li);
    });
  }

  document.querySelectorAll('.mystery-card li, #today-mystery-list li').forEach(bindMysteryItem);

  const accordions = document.querySelectorAll('[data-accordion]');
  const defaultOpenAccordion = document.querySelector('#oracoes [data-accordion]');
  let accordionViewportGuardTimer = null;
  const ACCORDION_EYE_OPEN_ICON = [
    '<span class="accordion-trigger-icon accordion-trigger-icon-open" aria-hidden="true">',
    '<svg viewBox="0 0 24 24" focusable="false">',
    '<path class="eye-lash" d="M4.2 8.4l-1.4-1.4M7 7.1 6 5.3M10.2 6.4 9.8 4.4M13.8 6.4l.4-2M17 7.1l1-1.8M19.8 8.4l1.4-1.4"></path>',
    '<path class="eye-outline" d="M2 12c2.5-3.7 5.9-5.5 10-5.5s7.5 1.8 10 5.5c-2.5 3.7-5.9 5.5-10 5.5S4.5 15.7 2 12Z"></path>',
    '<circle class="eye-pupil" cx="12" cy="12" r="3.4"></circle>',
    '<circle class="eye-glint" cx="10.8" cy="10.8" r="0.85"></circle>',
    '</svg>',
    '</span>'
  ].join('');
  const ACCORDION_EYE_CLOSED_ICON = [
    '<span class="accordion-trigger-icon accordion-trigger-icon-closed" aria-hidden="true">',
    '<svg viewBox="0 0 24 24" focusable="false">',
    '<path class="eye-closed-arc" d="M3 11.6c2.2 2.4 5.2 3.6 9 3.6s6.8-1.2 9-3.6"></path>',
    '<path class="eye-lash" d="M4.3 11.6l-1.5 1.3M7.2 13.3l-1 1.8M10.3 14.4l-.3 2.1M13.7 14.4l.3 2.1M16.8 13.3l1 1.8M19.7 11.6l1.5 1.3"></path>',
    '</svg>',
    '</span>'
  ].join('');

  const ensureAccordionTriggerIconMarkup = (button) => {
    if (!(button instanceof HTMLElement)) return;
    if (button.querySelector('.accordion-trigger-icon')) return;

    button.innerHTML = [
      ACCORDION_EYE_OPEN_ICON,
      ACCORDION_EYE_CLOSED_ICON,
      '<span class="accordion-trigger-label"></span>'
    ].join('');
  };

  const getAccordionScrollContainer = (element) => {
    if (!(element instanceof Element)) {
      return document.scrollingElement || document.documentElement;
    }

    let current = element.parentElement;
    while (current && current !== document.body) {
      const styles = window.getComputedStyle(current);
      const overflowY = styles.overflowY || '';
      const isScrollable = /(auto|scroll|overlay)/i.test(overflowY)
        && current.scrollHeight > current.clientHeight + 1;
      if (isScrollable) return current;
      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  };

  const keepAccordionTriggerVisible = (trigger) => {
    if (!(trigger instanceof HTMLElement)) return;
    const scrollContainer = getAccordionScrollContainer(trigger);
    const triggerRect = trigger.getBoundingClientRect();
    const headerOffset = (siteHeader ? siteHeader.offsetHeight : 0) + 8;
    let minTop = headerOffset;

    if (
      scrollContainer !== document.scrollingElement
      && scrollContainer !== document.documentElement
      && scrollContainer !== document.body
      && scrollContainer instanceof HTMLElement
    ) {
      const containerRect = scrollContainer.getBoundingClientRect();
      minTop = containerRect.top + 8;
    }

    if (triggerRect.top >= minTop) return;
    const delta = triggerRect.top - minTop;

    if (
      scrollContainer === document.scrollingElement
      || scrollContainer === document.documentElement
      || scrollContainer === document.body
    ) {
      window.scrollBy(0, delta);
      return;
    }

    scrollContainer.scrollTop += delta;
  };

  const scheduleAccordionViewportGuard = (trigger) => {
    window.requestAnimationFrame(() => keepAccordionTriggerVisible(trigger));

    if (accordionViewportGuardTimer) {
      window.clearTimeout(accordionViewportGuardTimer);
      accordionViewportGuardTimer = null;
    }

    // Re-check after accordion transition to avoid the trigger escaping above the viewport.
    accordionViewportGuardTimer = window.setTimeout(() => {
      keepAccordionTriggerVisible(trigger);
      accordionViewportGuardTimer = null;
    }, 380);
  };

  const setAccordionState = (card, open) => {
    const button = card.querySelector('[data-accordion-trigger]');
    const body = card.querySelector('[data-accordion-body]');
    if (!button || !body) return;
    ensureAccordionTriggerIconMarkup(button);

    const closedLabel = button.dataset.closedLabel
      || portalContent?.oracoes?.accordion?.closedLabel
      || readUiMessage('oracoes.accordionClosedLabel');
    const openLabel = button.dataset.openLabel
      || portalContent?.oracoes?.accordion?.openLabel
      || readUiMessage('oracoes.accordionOpenLabel');
    const stateLabel = open ? openLabel : closedLabel;
    const labelNode = button.querySelector('.accordion-trigger-label');

    card.classList.toggle('open', open);
    body.style.maxHeight = open ? `${body.scrollHeight}px` : '0px';
    button.dataset.eyeState = open ? 'open' : 'closed';
    button.setAttribute('aria-label', stateLabel);
    button.setAttribute('title', stateLabel);
    button.setAttribute('aria-expanded', String(open));
    if (labelNode) {
      labelNode.textContent = stateLabel;
    }
  };

  accordions.forEach((card) => {
    const button = card.querySelector('[data-accordion-trigger]');
    if (!button) return;

    setAccordionState(card, card === defaultOpenAccordion);

    button.addEventListener('click', () => {
      const isOpen = card.classList.contains('open');
      if (isOpen) {
        setAccordionState(card, false);
        scheduleAccordionViewportGuard(button);
        return;
      }

      accordions.forEach((otherCard) => {
        if (otherCard === card) return;
        setAccordionState(otherCard, false);
      });
      setAccordionState(card, true);
      scheduleAccordionViewportGuard(button);
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
  const songSearchResults = document.getElementById('song-search-results');
  const songSearchResultsList = document.getElementById('song-search-results-list');
  const songSearchResultsCantos = document.getElementById('song-search-results-cantos');
  const songSearchResultsListCantos = document.getElementById('song-search-results-list-cantos');
  const songFavoritesCard = document.getElementById('song-favorites-card');
  const songFavoritesList = document.getElementById('song-favorites-list');
  const songFavoritesSearchInput = document.getElementById('song-favorites-search-input');
  const songShareImportBtn = document.getElementById('song-share-import-btn');
  const songFavoritesShareBtn = document.getElementById('song-favorites-share-btn');
  const heroShareSongsBtn = document.getElementById('hero-share-songs-btn');
  const customSongsCard = document.getElementById('custom-songs-card');
  const customSongsList = document.getElementById('custom-songs-list');
  const customSongsAddBtn = document.getElementById('custom-songs-add-btn');
  const songToast = document.getElementById('song-toast');
  const authModal = document.getElementById('auth-modal');
  const authModalTitle = document.getElementById('auth-modal-title');
  const authModalCloseButtons = document.querySelectorAll('[data-auth-modal-close]');
  const authSessionsModal = document.getElementById('auth-sessions-modal');
  const authSessionsCloseButtons = document.querySelectorAll('[data-auth-sessions-close]');
  const authSessionsFeedback = document.getElementById('auth-sessions-feedback');
  const authSessionsList = document.getElementById('auth-sessions-list');
  const songShareModal = document.getElementById('song-share-modal');
  const songShareCloseButtons = document.querySelectorAll('[data-song-share-close]');
  const songShareQrImage = document.getElementById('song-share-qr-image');
  const songShareLinkInput = document.getElementById('song-share-link-input');
  const songShareFeedback = document.getElementById('song-share-feedback');
  const songShareCreateBtn = document.getElementById('song-share-create-btn');
  const songShareCopyBtn = document.getElementById('song-share-copy-btn');
  const songShareMergeModal = document.getElementById('song-share-merge-modal');
  const songShareMergeCloseButtons = document.querySelectorAll('[data-song-share-merge-close]');
  const songShareMergeSummary = document.getElementById('song-share-merge-summary');
  const songShareMergeAutoList = document.getElementById('song-share-merge-auto-list');
  const songShareMergeConflictsList = document.getElementById('song-share-merge-conflicts-list');
  const songShareMergeFeedback = document.getElementById('song-share-merge-feedback');
  const songShareMergeImportBtn = document.getElementById('song-share-merge-import-btn');
  const authForm = document.getElementById('auth-form');
  const authNameField = document.getElementById('auth-name-field');
  const authNameInput = document.getElementById('auth-name-input');
  const authQrOptionField = document.getElementById('auth-qr-option-field');
  const authQrOpenBtn = document.getElementById('auth-qr-open-btn');
  const authQrPanel = document.getElementById('auth-qr-panel');
  const authQrImage = document.getElementById('auth-qr-image');
  const authQrStatus = document.getElementById('auth-qr-status');
  const authQrRefreshBtn = document.getElementById('auth-qr-refresh-btn');
  const authQrCloseBtn = document.getElementById('auth-qr-close-btn');
  const authEmailField = document.getElementById('auth-email-field');
  const authEmailInput = document.getElementById('auth-email-input');
  const authPasswordField = document.getElementById('auth-password-field');
  const authPasswordInput = document.getElementById('auth-password-input');
  const authPasswordToggle = document.getElementById('auth-password-toggle');
  const authFormFeedback = document.getElementById('auth-form-feedback');
  const authRegisterCtaBtn = document.getElementById('auth-register-cta-btn');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authDeleteBtn = document.getElementById('auth-delete-btn');
  const favoriteConfirmModal = document.getElementById('favorite-confirm-modal');
  const favoriteConfirmTitle = document.getElementById('favorite-confirm-title');
  const favoriteConfirmMessage = document.getElementById('favorite-confirm-message');
  const favoriteConfirmPasswordWrap = document.getElementById('favorite-confirm-password-wrap');
  const favoriteConfirmPasswordLabel = document.getElementById('favorite-confirm-password-label');
  const favoriteConfirmPasswordInput = document.getElementById('favorite-confirm-password-input');
  const favoriteConfirmPasswordError = document.getElementById('favorite-confirm-password-error');
  const favoriteConfirmCancelBtn = document.getElementById('favorite-confirm-cancel');
  const favoriteConfirmAcceptBtn = document.getElementById('favorite-confirm-accept');
  const favoriteConfirmCloseButtons = document.querySelectorAll('[data-favorite-confirm-close]');
  const customSongModal = document.getElementById('custom-song-modal');
  const customSongModalCloseButtons = document.querySelectorAll('[data-custom-song-modal-close]');
  const customSongModalTitle = document.getElementById('custom-song-modal-title');
  const customSongTitleInput = document.getElementById('custom-song-title-input');
  const customSongKeyInput = document.getElementById('custom-song-key-input');
  const customSongTabLyricsBtn = document.getElementById('custom-song-tab-lyrics');
  const customSongTabChordsBtn = document.getElementById('custom-song-tab-chords');
  const customSongPanelLyrics = document.getElementById('custom-song-panel-lyrics');
  const customSongPanelChords = document.getElementById('custom-song-panel-chords');
  const customSongLyricsInput = document.getElementById('custom-song-lyrics-input');
  const customSongChordsInput = document.getElementById('custom-song-chords-input');
  const customSongDraftStatus = document.getElementById('custom-song-draft-status');
  const customSongSaveBtn = document.getElementById('custom-song-save-btn');
  const songModal = document.getElementById('song-modal');
  const songModalDialog = songModal ? songModal.querySelector('.song-modal-dialog') : null;
  const songModalCloseButtons = document.querySelectorAll('[data-song-modal-close]');
  const fetchedSongCard = document.getElementById('fetched-song-card');
  const fetchedSongTitle = document.getElementById('fetched-song-title');
  const fetchedSongMeta = document.getElementById('fetched-song-meta');
  const songModalExternalActions = document.getElementById('song-modal-external-actions');
  const songModalSpotifyLink = document.getElementById('song-modal-spotify-link');
  const songModalYoutubeLink = document.getElementById('song-modal-youtube-link');
  const fetchedSongLyrics = document.getElementById('fetched-song-lyrics');
  const songModalToneRow = songModal ? songModal.querySelector('.song-modal-tone-row') : null;
  const songModalToneLabel = songModal ? songModal.querySelector('.song-modal-tone-label') : null;
  const songToneResetBtn = document.getElementById('song-tone-reset');
  const songToneGrid = document.getElementById('song-tone-grid');
  let lastFocusedSongTrigger = null;
  let lastFocusedFavoriteConfirmTrigger = null;
  let lastFocusedCustomSongTrigger = null;
  let pendingFavoriteConfirmResolver = null;
  let pendingFavoriteConfirmMode = 'boolean';
  let favoriteConfirmRequirePassword = false;
  let favoriteConfirmCapturedPassword = '';
  const FAVORITE_CONFIRM_ACTION_ACCEPT = 'accept';
  const FAVORITE_CONFIRM_ACTION_CANCEL = 'cancel';
  const FAVORITE_CONFIRM_ACTION_DISMISS = 'dismiss';
  const SONG_SHARE_MERGE_ACTION_ACCEPT = 'accept';
  const SONG_SHARE_MERGE_ACTION_CANCEL = 'cancel';
  const SONG_SHARE_MERGE_ACTION_DISMISS = 'dismiss';
  const AUTH_QR_STATUS_PENDING = 'pending';
  const AUTH_QR_STATUS_APPROVED = 'approved';
  const AUTH_QR_STATUS_CONSUMED = 'consumed';
  const AUTH_QR_STATUS_EXPIRED = 'expired';
  const AUTH_QR_POLL_INTERVAL_MS = 1600;
  const AUTH_SESSION_HEALTHCHECK_INTERVAL_MS = 12000;
  const AUTH_QR_QUERY_SESSION_KEY = 'auth_qr_session';
  const AUTH_QR_QUERY_TOKEN_KEY = 'auth_qr_token';
  const SONG_SHARE_QUERY_KEY = 'song_share';
  const SONG_SHARE_LAST_VIEW_STORAGE_KEY = 'portal_song_share_last_view_id_v1';
  const SONG_SHARE_LOCAL_STATE_STORAGE_KEY = 'portal_song_share_local_state_v1';
  let authMode = 'login';
  let authRequestPending = false;
  let authToken = '';
  let authUser = null;
  let lastFocusedAuthTrigger = null;
  let authQrRequestPending = false;
  let authQrPanelOpen = false;
  let authQrSessionGuid = '';
  let authQrPollToken = '';
  let authQrApproveUrl = '';
  let authQrExpiresAtUtc = '';
  let authQrPollTimerId = null;
  let authQrCompletePending = false;
  let authQrPollInFlight = false;
  let pendingAuthQrApproval = null;
  let authQrApprovalHandling = false;
  let lastFocusedAuthSessionsTrigger = null;
  let authSessionsRequestPending = false;
  let authSessionsRevokePendingGuid = '';
  let lastFocusedSongShareTrigger = null;
  let lastFocusedSongShareMergeTrigger = null;
  let songShareRequestPending = false;
  let songShareImportPending = false;
  let songShareCurrentLink = '';
  let pendingSongShareImport = '';
  let pendingSongShareMergeAfterLogin = false;
  let pendingSongShareMergeResolver = null;
  let songShareViewModeLoaded = false;
  let songShareCurrentViewId = '';
  let pendingAuthRegisterPrefill = null;
  let authSessionHealthcheckTimerId = null;
  let authSessionHealthcheckInFlight = false;
  const songSearchWidgets = [
    {
      id: 'header',
      form: songFetchForm,
      input: songSearchQueryInput,
      searchBtn: songSearchTriggerBtn,
      clearBtn: songSearchClearBtn,
      resultsContainer: songSearchResults,
      resultsList: songSearchResultsList
    },
    {
      id: 'cantos',
      form: songFetchFormCantos,
      input: songSearchQueryInputCantos,
      searchBtn: songSearchTriggerBtnCantos,
      clearBtn: songSearchClearBtnCantos,
      resultsContainer: songSearchResultsCantos,
      resultsList: songSearchResultsListCantos
    }
  ].filter((widget) => (
    widget.input
    && widget.clearBtn
    && widget.resultsContainer
    && widget.resultsList
  ));
  const clearSearchInputIfEmail = (input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const rawValue = String(input.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(rawValue)) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const hardenSearchInputAutofill = (input, fallbackName = '') => {
    if (!(input instanceof HTMLInputElement)) return;
    const safeNameBase = String(input.getAttribute('name') || fallbackName || input.id || 'search_field').trim();
    if (safeNameBase) {
      const safeNameNonce = Math.random().toString(36).slice(2, 10);
      input.setAttribute('name', `${safeNameBase}_${safeNameNonce}`);
    }
    input.setAttribute('autocomplete', 'new-password');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-form-type', 'other');
    input.setAttribute('aria-autocomplete', 'none');

    input.readOnly = true;
    const unlockInput = () => {
      input.readOnly = false;
      input.removeEventListener('focus', unlockInput);
      input.removeEventListener('pointerdown', unlockInput);
      input.removeEventListener('keydown', unlockInput);
      input.removeEventListener('touchstart', unlockInput);
    };
    input.addEventListener('focus', unlockInput);
    input.addEventListener('pointerdown', unlockInput);
    input.addEventListener('keydown', unlockInput);
    input.addEventListener('touchstart', unlockInput, { passive: true });

    clearSearchInputIfEmail(input);
    window.requestAnimationFrame(() => {
      clearSearchInputIfEmail(input);
    });
    window.setTimeout(() => {
      clearSearchInputIfEmail(input);
    }, 180);
    window.setTimeout(() => {
      clearSearchInputIfEmail(input);
    }, 700);
    window.setTimeout(() => {
      clearSearchInputIfEmail(input);
    }, 2200);
    window.setTimeout(() => {
      clearSearchInputIfEmail(input);
    }, 4600);
  };
  const hardenSearchFormAutofill = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    form.setAttribute('autocomplete', 'off');
    form.setAttribute('data-form-type', 'other');
  };
  hardenSearchFormAutofill(songFetchForm);
  hardenSearchFormAutofill(songFetchFormCantos);
  hardenSearchInputAutofill(songSearchQueryInput, 'song_search_menu');
  hardenSearchInputAutofill(songSearchQueryInputCantos, 'song_search_cantos');
  hardenSearchInputAutofill(songFavoritesSearchInput, 'song_favorites_search');
  hardenSearchInputAutofill(songSaveLocationPickerSearchInput, 'song_location_picker_search');
  const autofillProtectedInputs = [
    songSearchQueryInput,
    songSearchQueryInputCantos,
    songFavoritesSearchInput,
    songSaveLocationPickerSearchInput,
  ].filter((input) => input instanceof HTMLInputElement);
  const recheckAutofillProtectedInputs = () => {
    autofillProtectedInputs.forEach((input) => {
      clearSearchInputIfEmail(input);
    });
  };
  window.addEventListener('pageshow', () => {
    recheckAutofillProtectedInputs();
    window.setTimeout(recheckAutofillProtectedInputs, 180);
  });
  songSearchWidgets.forEach((widget) => {
    widget.searchState = {
      query: '',
      normalizedQuery: '',
      page: 0,
      hasMore: false,
      loadingMore: false
    };
  });
  const songSearchFallbackImage = portalContent?.cantos?.search?.resultFallbackImage || './assets/img/logo.png';
  let songFavorites = [];
  let songFavoritesLoading = false;
  let songFavoritesRefreshQueued = false;
  let songFavoritesReorderPending = false;
  let songFavoritesDragId = '';
  let songFavoritesDragStartOrder = [];
  let songFavoritesSearchQuery = '';
  let songFavoritesPendingScrollRestoreTop = null;
  let songFavoritesPendingScrollRestoreId = '';
  let songFavoritesPendingScrollRestoreAnchorOffset = null;
  const songFavoritesByUrl = new Map();
  const SONG_FAVORITES_SCROLL_MOBILE_BREAKPOINT = 680;
  const SONG_FAVORITES_SCROLL_ROWS_DESKTOP = 2;
  const SONG_FAVORITES_SCROLL_ROWS_MOBILE = 4;
  const SONG_SELECTED_KEYS_STORAGE_KEY = 'portal_song_selected_keys_v1';
  const SONG_SELECTED_KEYS_STORAGE_LIMIT = 600;
  const songSelectedKeysByUrl = new Map();
  let songToneFavoritePersistTimerId = null;
  let songToneFavoritePersistContext = null;
  let songKeyAutoDetectRequestId = 0;

  const normalizeSongUrlKey = (url) => {
    const rawValue = String(url || '').trim();
    if (!rawValue) return '';
    try {
      const parsed = new URL(rawValue);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') {
        return rawValue.replace(/\/+$/, '').toLowerCase();
      }
      const host = String(parsed.hostname || '')
        .toLowerCase()
        .replace(/^www\./, '');
      const path = String(parsed.pathname || '/')
        .replace(/\/+$/, '')
        .toLowerCase();
      return `${host}${path || '/'}`;
    } catch (_err) {
      return rawValue.replace(/\/+$/, '').toLowerCase();
    }
  };
  const normalizeSongMatchToken = (value) => (
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
  const normalizeSongTitleArtistKey = (title, artist = '') => {
    const normalizedTitle = normalizeSongMatchToken(title);
    if (!normalizedTitle) return '';
    const normalizedArtist = normalizeSongMatchToken(artist);
    return normalizedArtist ? `${normalizedTitle}|${normalizedArtist}` : normalizedTitle;
  };
  const normalizeSongFavorite = (rawFavorite) => {
    const favorite = asObject(rawFavorite);
    const url = (favorite.url || favorite.song_url || '').trim();
    const lyricsText = String(favorite.lyrics_text || favorite.lyricsText || '');
    const chordsText = String(favorite.chords_text || favorite.chordsText || '');
    const rawUsageLocations = Array.isArray(favorite.usage_locations)
      ? favorite.usage_locations
      : (Array.isArray(favorite.usageLocations) ? favorite.usageLocations : []);
    const usageLocations = dedupeUsageLabels(
      rawUsageLocations
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    );
    const parsedOrderIndex = Number.parseInt(String(favorite.orderIndex ?? favorite.order_index ?? ''), 10);
    const hasLyrics = Boolean(favorite.has_lyrics) || Boolean(favorite.hasLyrics) || Boolean(lyricsText.trim());
    const hasChords = Boolean(favorite.has_chords) || Boolean(favorite.hasChords) || Boolean(chordsText.trim());

    return {
      id: Number(favorite.id) || 0,
      orderIndex: Number.isInteger(parsedOrderIndex) && parsedOrderIndex > 0 ? parsedOrderIndex : 0,
      url,
      title: (favorite.title || '').trim() || readSongMessage('defaultSongTitle'),
      artist: (favorite.artist || '').trim(),
      source: (favorite.source || '').trim(),
      sourceLabel: resolveSongSourceLabel(
        (favorite.source || '').trim(),
        (favorite.source_label || favorite.sourceLabel || '').trim()
      ),
      imageUrl: (favorite.image_url || favorite.imageUrl || '').trim(),
      spotifyUrl: (favorite.spotify_url || favorite.spotifyUrl || '').trim(),
      youtubeUrl: (favorite.youtube_url || favorite.youtubeUrl || '').trim(),
      lyricsSource: (favorite.lyrics_source || favorite.lyricsSource || '').trim(),
      lyricsSourceUrl: (favorite.lyrics_source_url || favorite.lyricsSourceUrl || '').trim(),
      lyricsText,
      chordsSource: (favorite.chords_source || favorite.chordsSource || '').trim(),
      chordsSourceUrl: (favorite.chords_source_url || favorite.chordsSourceUrl || '').trim(),
      chordsOriginalKey: (favorite.chords_original_key || favorite.chordsOriginalKey || '').trim(),
      chordsSelectedKey: (favorite.chords_selected_key || favorite.chordsSelectedKey || '').trim(),
      chordsText,
      usageLocations,
      hasLyrics,
      hasChords,
      updatedAtUtc: (favorite.updated_at_utc || favorite.updatedAtUtc || '').trim(),
      createdAtUtc: (favorite.created_at_utc || favorite.createdAtUtc || '').trim(),
    };
  };
  const extractPlainLyricsFromChordsTextLocal = (chordsText) => {
    const normalizedInput = String(chordsText || '').replace(/\r\n?/g, '\n');
    if (!normalizedInput.trim()) return '';
    const outputLines = [];
    normalizedInput.split('\n').forEach((rawLine) => {
      if (!rawLine.trim()) {
        outputLines.push('');
        return;
      }
      const withoutBracketedChords = rawLine.replace(/\[[^\]\n]+\]/g, '');
      const withoutEmptyParenthesis = withoutBracketedChords.replace(/\(\s*\)/g, '');
      const compactedLine = withoutEmptyParenthesis.replace(/[ \t]{2,}/g, ' ').trim();
      if (!compactedLine) return;
      if (!/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(compactedLine)) return;
      outputLines.push(compactedLine);
    });
    return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const findCachedFavoriteBySongIdentity = (songPayload) => {
    const songIdentity = readSongIdentityForMatch(songPayload);
    if (songIdentity.urlKey) {
      const cachedByUrl = songFavoritesByUrl.get(songIdentity.urlKey);
      if (cachedByUrl) return cachedByUrl;
    }
    if (!songFavorites.length) return null;
    return songFavorites.find((favorite) => (
      isSongIdentityMatch(songIdentity, readSongIdentityForMatch(favorite))
    )) || null;
  };

  const sortSongFavoritesByOrder = (favorites) => {
    const safeFavorites = Array.isArray(favorites) ? [...favorites] : [];
    safeFavorites.sort((a, b) => {
      const updatedA = String(a?.updatedAtUtc || '');
      const updatedB = String(b?.updatedAtUtc || '');
      if (updatedA === updatedB) {
        return (Number(b?.id) || 0) - (Number(a?.id) || 0);
      }
      return updatedA < updatedB ? 1 : -1;
    });
    safeFavorites.sort((a, b) => {
      const orderA = Number(a?.orderIndex) || 0;
      const orderB = Number(b?.orderIndex) || 0;
      const safeOrderA = orderA > 0 ? orderA : Number.MAX_SAFE_INTEGER;
      const safeOrderB = orderB > 0 ? orderB : Number.MAX_SAFE_INTEGER;
      return safeOrderA - safeOrderB;
    });
    return safeFavorites;
  };

  const rebuildSongFavoritesIndex = () => {
    songFavoritesByUrl.clear();
    songFavorites.forEach((favorite) => {
      const key = normalizeSongUrlKey(favorite.url);
      if (!key) return;
      songFavoritesByUrl.set(key, favorite);
    });
  };
  const filterSongFavorites = (favorites, rawQuery = '') => {
    const safeFavorites = Array.isArray(favorites) ? favorites : [];
    const normalizedQuery = normalizeSongMatchToken(rawQuery);
    if (!normalizedQuery) return safeFavorites;

    return safeFavorites.filter((favorite) => {
      const usageLocations = Array.isArray(favorite?.usageLocations) ? favorite.usageLocations : [];
      const haystack = normalizeSongMatchToken([
        favorite?.title,
        favorite?.artist,
        favorite?.sourceLabel,
        favorite?.source,
        ...usageLocations
      ].filter(Boolean).join(' '));
      return haystack.includes(normalizedQuery);
    });
  };
  const captureSongFavoritesScrollPosition = (favoriteId = '', triggerElement = null) => {
    if (!songFavoritesList) return;
    songFavoritesPendingScrollRestoreTop = Number(songFavoritesList.scrollTop || 0);
    songFavoritesPendingScrollRestoreId = String(favoriteId || '').trim();
    songFavoritesPendingScrollRestoreAnchorOffset = null;

    const resolveTargetItem = () => {
      if (triggerElement instanceof HTMLElement) {
        const fromTrigger = triggerElement.closest('.song-favorite-item');
        if (fromTrigger instanceof HTMLElement && songFavoritesList.contains(fromTrigger)) {
          return fromTrigger;
        }
      }

      if (!songFavoritesPendingScrollRestoreId) return null;
      return Array.from(songFavoritesList.querySelectorAll('.song-favorite-item'))
        .find((node) => (
          node instanceof HTMLElement
          && String(node.dataset.songFavoriteId || '').trim() === songFavoritesPendingScrollRestoreId
        )) || null;
    };

    const targetItem = resolveTargetItem();
    if (!(targetItem instanceof HTMLElement)) return;
    if (!songFavoritesPendingScrollRestoreId) {
      songFavoritesPendingScrollRestoreId = String(targetItem.dataset.songFavoriteId || '').trim();
    }
    songFavoritesPendingScrollRestoreAnchorOffset = Number(
      targetItem.offsetTop - songFavoritesPendingScrollRestoreTop
    );
  };
  const restoreSongFavoritesScrollPosition = () => {
    if (!songFavoritesList) return;
    if (!Number.isFinite(songFavoritesPendingScrollRestoreTop)) return;

    const desiredTop = Math.max(0, Number(songFavoritesPendingScrollRestoreTop || 0));
    const desiredId = String(songFavoritesPendingScrollRestoreId || '').trim();
    const desiredAnchorOffset = Number(songFavoritesPendingScrollRestoreAnchorOffset);
    const applyRestore = () => {
      if (!songFavoritesList) return;
      const maxScrollTop = Math.max(0, songFavoritesList.scrollHeight - songFavoritesList.clientHeight);
      let nextTop = Math.max(0, Math.min(desiredTop, maxScrollTop));

      if (desiredId && Number.isFinite(desiredAnchorOffset)) {
        const targetItem = Array.from(songFavoritesList.querySelectorAll('.song-favorite-item'))
          .find((node) => (
            node instanceof HTMLElement
            && String(node.dataset.songFavoriteId || '').trim() === desiredId
          ));
        if (targetItem instanceof HTMLElement) {
          nextTop = targetItem.offsetTop - desiredAnchorOffset;
          nextTop = Math.max(0, Math.min(nextTop, maxScrollTop));
        }
      }

      songFavoritesList.scrollTop = nextTop;
    };

    applyRestore();
    window.requestAnimationFrame(applyRestore);
    window.setTimeout(applyRestore, 140);
    songFavoritesPendingScrollRestoreTop = null;
    songFavoritesPendingScrollRestoreId = '';
    songFavoritesPendingScrollRestoreAnchorOffset = null;
  };

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
    contentType: 'chords',
    customSongId: '',
    customSongIsDraft: false,
  };
  let songModalCloseInProgress = false;
  const resolveSongSourceLabel = (source, explicitSourceLabel = '') => {
    const trimmedExplicit = (explicitSourceLabel || '').trim();
    if (trimmedExplicit) return trimmedExplicit;

    if (source === 'cifraclub') return readSongMessage('sourceLabelCifraClub');
    if (source === 'letras') return readSongMessage('sourceLabelLetras');
    return readSongMessage('sourceLabelCifras');
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

  const readSongSelectedKeysStore = () => {
    try {
      const raw = window.localStorage.getItem(SONG_SELECTED_KEYS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  };

  const writeSongSelectedKeysStore = () => {
    try {
      const entries = Array.from(songSelectedKeysByUrl.entries()).slice(-SONG_SELECTED_KEYS_STORAGE_LIMIT);
      const payload = {};
      entries.forEach(([urlKey, selectedKey]) => {
        if (!urlKey || !selectedKey) return;
        payload[urlKey] = selectedKey;
      });
      window.localStorage.setItem(SONG_SELECTED_KEYS_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Ignore storage failures.
    }
  };

  const normalizeSongSelectedKey = (rawKey) => {
    const parts = splitKey(rawKey || '');
    if (!parts) return '';
    return `${parts.root}${parts.suffix || ''}`.trim();
  };

  const rememberSongSelectedKey = (url, rawKey) => {
    const urlKey = normalizeSongUrlKey(url);
    const selectedKey = normalizeSongSelectedKey(rawKey);
    if (!urlKey || !selectedKey) return '';
    songSelectedKeysByUrl.set(urlKey, selectedKey);
    writeSongSelectedKeysStore();
    return selectedKey;
  };

  const readSongSelectedKey = (url) => {
    const urlKey = normalizeSongUrlKey(url);
    if (!urlKey) return '';
    return normalizeSongSelectedKey(songSelectedKeysByUrl.get(urlKey) || '');
  };

  const buildSongTonePersistPayload = (favorite, selectedKey) => {
    const safeFavorite = asObject(favorite);
    const fallbackUrl = (songState.sourceUrl || '').trim();
    const fallbackSelectedKey = normalizeSongSelectedKey(selectedKey || resolveCurrentSongSelectedKeyForSave());
    const fallbackOriginalKey = normalizeSongSelectedKey(songState.originalKey || '');

    return {
      url: (safeFavorite.url || fallbackUrl || '').trim(),
      title: (safeFavorite.title || songState.title || '').trim(),
      artist: (safeFavorite.artist || songState.artist || '').trim(),
      source: (safeFavorite.source || songState.source || '').trim(),
      source_label: (safeFavorite.sourceLabel || songState.sourceLabel || '').trim(),
      chords_source: (safeFavorite.chordsSource || songState.source || '').trim(),
      chords_source_url: (safeFavorite.chordsSourceUrl || fallbackUrl || '').trim(),
      chords_original_key: normalizeSongSelectedKey(safeFavorite.chordsOriginalKey || fallbackOriginalKey),
      chords_selected_key: fallbackSelectedKey,
      chords_text: String(safeFavorite.chordsText || (songState.contentType === 'chords' ? songState.originalContent : '') || ''),
    };
  };

  const persistFavoriteTonePreference = async (persistPayload) => {
    if (!isAuthLoggedIn()) return;
    const payload = asObject(persistPayload);
    const url = (payload.url || '').trim();
    const selectedKey = normalizeSongSelectedKey(payload.chords_selected_key || '');
    if (!url || !selectedKey) return;

    try {
      const response = await fetch('/api/songs/favorites', {
        method: 'POST',
        headers: buildUserScopedApiHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(payload)
      });
      const responsePayload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        return;
      }
      if (!response.ok || !responsePayload.ok) {
        throw new Error(responsePayload?.detail?.message || responsePayload?.message || 'favorite_tone_save_failed');
      }
      if (responsePayload.favorite) {
        upsertSongFavorite(responsePayload.favorite);
      }
    } catch (err) {
      console.warn('[song-tone] Falha ao salvar tom selecionado no favorito.', {
        url,
        selectedKey,
        error: err instanceof Error ? err.message : String(err || '')
      });
    }
  };

  const scheduleFavoriteTonePreferencePersist = (favorite, selectedKey) => {
    const payload = buildSongTonePersistPayload(favorite, selectedKey);
    if (!payload.url || !payload.chords_selected_key) return;

    songToneFavoritePersistContext = payload;
    if (songToneFavoritePersistTimerId !== null) {
      window.clearTimeout(songToneFavoritePersistTimerId);
      songToneFavoritePersistTimerId = null;
    }

    songToneFavoritePersistTimerId = window.setTimeout(() => {
      const pendingPayload = songToneFavoritePersistContext;
      songToneFavoritePersistContext = null;
      songToneFavoritePersistTimerId = null;
      if (!pendingPayload) return;
      void persistFavoriteTonePreference(pendingPayload);
    }, 680);
  };

  const flushFavoriteTonePreferencePersist = () => {
    if (songToneFavoritePersistTimerId !== null) {
      window.clearTimeout(songToneFavoritePersistTimerId);
      songToneFavoritePersistTimerId = null;
    }
    const pendingPayload = songToneFavoritePersistContext;
    songToneFavoritePersistContext = null;
    if (!pendingPayload) return;
    void persistFavoriteTonePreference(pendingPayload);
  };

  const updateFavoriteSelectedKeyInMemory = (urlKey, selectedKey) => {
    if (!urlKey) return null;
    const favorite = songFavoritesByUrl.get(urlKey);
    if (!favorite) return null;

    const normalizedSelectedKey = normalizeSongSelectedKey(selectedKey);
    if (!normalizedSelectedKey) return favorite;
    const updatedAtUtc = new Date().toISOString();
    const updatedFavorite = {
      ...favorite,
      chordsSelectedKey: normalizedSelectedKey,
      updatedAtUtc
    };
    const favoriteIndex = songFavorites.findIndex((item) => normalizeSongUrlKey(item.url) === urlKey);
    if (favoriteIndex >= 0) {
      songFavorites[favoriteIndex] = updatedFavorite;
    }
    songFavoritesByUrl.set(urlKey, updatedFavorite);
    return updatedFavorite;
  };

  const calculateSongToneSemitonesToRoot = (targetRoot) => {
    const originalIndex = NOTE_INDEX_MAP[songState.originalRoot || ''];
    const targetIndex = NOTE_INDEX_MAP[targetRoot || ''];
    if (!Number.isInteger(originalIndex) || !Number.isInteger(targetIndex)) {
      return 0;
    }

    let semitones = (targetIndex - originalIndex + 12) % 12;
    if (semitones > 6) semitones -= 12;
    return semitones;
  };

  const resolveSavedSelectedKeyForSong = (songUrl, preferredSelectedKey = '') => {
    const explicit = normalizeSongSelectedKey(preferredSelectedKey);
    if (explicit) return explicit;

    const urlKey = normalizeSongUrlKey(songUrl);
    if (!urlKey) return '';

    const favorite = songFavoritesByUrl.get(urlKey);
    const favoriteSelectedKey = normalizeSongSelectedKey(favorite?.chordsSelectedKey || '');
    if (favoriteSelectedKey) return favoriteSelectedKey;

    return readSongSelectedKey(songUrl);
  };

  const applySavedSelectedKeyToCurrentSong = (songUrl, preferredSelectedKey = '') => {
    if (!songState.loaded || songState.contentType !== 'chords' || !songState.originalRoot) return;

    const selectedKey = resolveSavedSelectedKeyForSong(songUrl, preferredSelectedKey);
    if (!selectedKey) return;
    const selectedParts = splitKey(selectedKey);
    if (!selectedParts || !selectedParts.root) return;

    songState.semitones = calculateSongToneSemitonesToRoot(selectedParts.root);
    rememberSongSelectedKey(songUrl, selectedKey);
  };

  const persistCurrentSongTonePreference = () => {
    if (!songState.loaded || songState.contentType !== 'chords' || !songState.originalRoot) return;
    if (songState.source === 'manual') return;

    const songUrl = (songState.sourceUrl || '').trim();
    if (!songUrl) return;

    const selectedKey = resolveCurrentSongSelectedKeyForSave();
    const normalizedSelectedKey = rememberSongSelectedKey(songUrl, selectedKey);
    if (!normalizedSelectedKey) return;

    const urlKey = normalizeSongUrlKey(songUrl);
    if (!urlKey || !songFavoritesByUrl.has(urlKey)) return;
    const updatedFavorite = updateFavoriteSelectedKeyInMemory(urlKey, normalizedSelectedKey);
    if (!updatedFavorite) return;

    scheduleFavoriteTonePreferencePersist(updatedFavorite, normalizedSelectedKey);
  };

  const bootstrapSongSelectedKeysStore = () => {
    const payload = readSongSelectedKeysStore();
    Object.entries(payload).forEach(([rawUrlKey, rawSelectedKey]) => {
      const urlKey = normalizeSongUrlKey(rawUrlKey);
      const selectedKey = normalizeSongSelectedKey(rawSelectedKey);
      if (!urlKey || !selectedKey) return;
      songSelectedKeysByUrl.set(urlKey, selectedKey);
    });
  };
  bootstrapSongSelectedKeysStore();

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

  const escapeHtmlText = (value) => (
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  );

  const renderChordTokensHtml = (value) => (
    escapeHtmlText(value).replace(
      /\[[^\]\r\n]+\]/g,
      (token) => `<span class="song-chord-token">${token}</span>`
    )
  );

  const setSongFeedback = (message, type = '') => {
    if (!message) return;
    const normalizedType = (
      type === 'is-success'
      || type === 'is-error'
      || type === 'is-warning'
      || type === 'is-loading'
    )
      ? type
      : '';
    showSongToast(message, normalizedType);
  };

  const setFetchSubmitState = (loading, label) => {
    if (!songFetchSubmit) return;
    songFetchSubmit.disabled = loading;
    songFetchSubmit.textContent = label;
  };

  const SONG_SEARCH_DEFAULT_PAGE_SIZE = 18;
  const songSearchCacheByQuery = new Map();

  const normalizeSongSearchPage = (rawPage) => {
    const parsed = Number.parseInt(String(rawPage ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return parsed;
  };

  const normalizeSongSearchPageSize = (rawPageSize) => {
    const parsed = Number.parseInt(String(rawPageSize ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed < 1) return SONG_SEARCH_DEFAULT_PAGE_SIZE;
    return Math.max(1, parsed);
  };

  const createSongSearchCacheEntry = (query = '') => ({
    query,
    pages: new Map(),
    pageSize: SONG_SEARCH_DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false
  });

  const readSongSearchCacheEntry = (normalizedQuery) => {
    if (!normalizedQuery) return null;
    const cacheEntry = songSearchCacheByQuery.get(normalizedQuery);
    if (!cacheEntry || !(cacheEntry.pages instanceof Map)) return null;
    return cacheEntry;
  };

  const getOrCreateSongSearchCacheEntry = (normalizedQuery, query = '') => {
    if (!normalizedQuery) return null;
    const existing = readSongSearchCacheEntry(normalizedQuery);
    if (existing) {
      if (query) existing.query = query;
      return existing;
    }

    const created = createSongSearchCacheEntry(query);
    songSearchCacheByQuery.set(normalizedQuery, created);
    return created;
  };

  const countSongSearchCachedResults = (cacheEntry, maxPage = null) => {
    if (!cacheEntry || !(cacheEntry.pages instanceof Map)) return 0;

    const pageKeys = Array.from(cacheEntry.pages.keys())
      .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
      .sort((a, b) => a - b);
    let total = 0;
    pageKeys.forEach((pageNumber) => {
      if (Number.isInteger(maxPage) && pageNumber > maxPage) return;
      const pageResults = cacheEntry.pages.get(pageNumber);
      if (!Array.isArray(pageResults)) return;
      total += pageResults.length;
    });
    return total;
  };

  const createSongSearchWidgetState = () => ({
    query: '',
    normalizedQuery: '',
    page: 0,
    hasMore: false,
    loadingMore: false
  });

  const readSongSearchWidgetState = (widget) => {
    if (!widget) return null;
    if (!widget.searchState || typeof widget.searchState !== 'object') {
      widget.searchState = createSongSearchWidgetState();
    }
    return widget.searchState;
  };

  const SONG_SEARCH_AUTO_LOAD_THRESHOLD_PX = 260;

  const maybeAutoLoadMoreSongSearch = (targetWidget = null) => {
    const activeWidget = resolveSongSearchWidget(targetWidget);
    if (!activeWidget || !activeWidget.resultsContainer) return;
    const state = readSongSearchWidgetState(activeWidget);
    if (!state || state.loadingMore || !state.hasMore) return;
    if (activeWidget.resultsContainer.hidden) return;

    const query = (state.query || '').trim();
    if (!query) return;

    const remaining = (
      activeWidget.resultsContainer.scrollHeight
      - activeWidget.resultsContainer.scrollTop
      - activeWidget.resultsContainer.clientHeight
    );
    if (remaining > SONG_SEARCH_AUTO_LOAD_THRESHOLD_PX) return;

    const nextPage = normalizeSongSearchPage(state.page + 1);
    updateSongSearchLoadMoreButton(activeWidget, {
      hasMore: true,
      loading: true
    });
    void executeSongSearch(query, {
      fromTyping: false,
      fromLoadMore: true,
      widget: activeWidget,
      page: nextPage,
      append: true
    });
  };

  const updateSongSearchLoadMoreButton = (targetWidget = null, options = {}) => {
    const activeWidget = resolveSongSearchWidget(targetWidget);
    if (!activeWidget) return;
    const state = readSongSearchWidgetState(activeWidget);
    if (!state) return;

    const hasMore = Boolean(options.hasMore);
    const loading = Boolean(options.loading);

    state.hasMore = hasMore;
    state.loadingMore = loading;
    if (!loading && hasMore) {
      window.requestAnimationFrame(() => {
        maybeAutoLoadMoreSongSearch(activeWidget);
      });
    }
  };

  const resetSongSearchWidgetState = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    const targetWidgets = targetWidget ? [targetWidget] : songSearchWidgets;
    targetWidgets.forEach((widget) => {
      widget.searchState = createSongSearchWidgetState();
      updateSongSearchLoadMoreButton(widget, {
        visible: false,
        hasMore: false,
        loading: false
      });
    });
  };

  const clearSongSearchResults = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    if (isSongSaveLocationPickerOpen()) {
      closeSongSaveLocationPicker();
    }
    const targetWidgets = targetWidget ? [targetWidget] : songSearchWidgets;
    targetWidgets.forEach((widget) => {
      widget.resultsList.innerHTML = '';
      widget.resultsContainer.hidden = true;
      updateSongSearchLoadMoreButton(widget, {
        visible: false,
        hasMore: false,
        loading: false
      });
    });
  };

  let songToastTimerId = null;

  const showSongToast = (message, type = '') => {
    if (!songToast) return;
    songToast.textContent = message || '';
    songToast.classList.remove('is-warning', 'is-success', 'is-error', 'is-loading', 'is-visible');
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

  const normalizeAuthUser = (value) => {
    const safeValue = value && typeof value === 'object' ? value : null;
    if (!safeValue) return null;
    const guid = String(safeValue.guid || '').trim();
    const name = String(safeValue.name || safeValue.full_name || safeValue.fullName || '').trim();
    const email = String(safeValue.email || '').trim().toLowerCase();
    if (!guid || !email) return null;
    return { guid, name, email };
  };

  const isSongShareOwnedByLoggedUser = (sourcePayload) => {
    const currentGuid = String(authUser?.guid || '').trim();
    if (!currentGuid) return false;
    const safeSource = asObject(sourcePayload);
    const sourceGuid = String(
      safeSource.user_guid
      || safeSource.userGuid
      || safeSource.guid
      || ''
    ).trim();
    return Boolean(sourceGuid && sourceGuid === currentGuid);
  };

  const normalizeSongShareId = (value = '') => {
    const safeValue = String(value || '').trim();
    if (!safeValue) return '';
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(safeValue)) return '';
    return safeValue;
  };

  const readSongShareIdFromUrl = () => {
    try {
      const currentUrl = new URL(window.location.href);
      return normalizeSongShareId(currentUrl.searchParams.get(SONG_SHARE_QUERY_KEY));
    } catch (_err) {
      return '';
    }
  };

  const clearSongShareFromUrl = () => {
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete(SONG_SHARE_QUERY_KEY);
      const nextQuery = currentUrl.searchParams.toString();
      const nextUrl = `${currentUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${currentUrl.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    } catch (_err) {
      return;
    }
  };

  const readLastSongShareViewId = () => {
    try {
      return normalizeSongShareId(window.localStorage.getItem(SONG_SHARE_LAST_VIEW_STORAGE_KEY) || '');
    } catch (_err) {
      return '';
    }
  };

  const persistLastSongShareViewId = (shareId = '') => {
    const safeShareId = normalizeSongShareId(shareId);
    try {
      if (!safeShareId) {
        window.localStorage.removeItem(SONG_SHARE_LAST_VIEW_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(SONG_SHARE_LAST_VIEW_STORAGE_KEY, safeShareId);
    } catch (_err) {
      return;
    }
  };

  const shouldAutoOpenSongShareView = (shareId = '') => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) return false;
    return readLastSongShareViewId() === safeShareId;
  };

  const clearSongShareLocalState = () => {
    try {
      window.localStorage.removeItem(SONG_SHARE_LOCAL_STATE_STORAGE_KEY);
    } catch (_err) {
      return;
    }
  };

  const leaveSongShareViewModeAfterMutation = () => {
    if (!songShareViewModeLoaded) return;
    clearSongShareLocalState();
    pendingSongShareMergeAfterLogin = false;
    const safeShareId = normalizeSongShareId(songShareCurrentViewId || readSongShareIdFromUrl());
    if (safeShareId) {
      songShareCurrentViewId = safeShareId;
      pendingSongShareImport = safeShareId;
      persistLastSongShareViewId(safeShareId);
    }
    setSongShareRequestState(false);
  };

  const isAuthLoggedIn = () => Boolean(authToken && normalizeAuthUser(authUser));

  const ensureSongShareImportForMutations = (triggerElement = null) => {
    if (!songShareViewModeLoaded) return true;

    const safeTrigger = triggerElement instanceof HTMLElement ? triggerElement : null;
    const safeShareId = normalizeSongShareId(songShareCurrentViewId || readSongShareIdFromUrl());
    if (!isAuthLoggedIn()) {
      showSongToast('Faça login e importe a lista compartilhada para poder alterar.', 'is-warning');
      pendingSongShareMergeAfterLogin = true;
      pendingSongShareImport = safeShareId;
      runDeferredTask(() => {
        openAuthModal('login', safeTrigger || authMenuTrigger);
      }, 80);
      return false;
    }

    showSongToast('Para alterar, importe a lista compartilhada para sua conta.', 'is-warning');
    if (safeShareId) {
      pendingSongShareImport = safeShareId;
      pendingSongShareMergeAfterLogin = true;
      runDeferredTask(() => {
        void maybeHandlePendingSongShareImport(safeTrigger || authMenuTrigger);
      }, 90);
    }
    return false;
  };

  const syncHeroShareSongsButtonState = () => {
    const loggedIn = isAuthLoggedIn();

    if (songFavoritesShareBtn) {
      const shouldShowFavoritesShare = loggedIn;
      songFavoritesShareBtn.hidden = !shouldShowFavoritesShare;
      songFavoritesShareBtn.disabled = !shouldShowFavoritesShare;
      songFavoritesShareBtn.setAttribute('aria-hidden', shouldShowFavoritesShare ? 'false' : 'true');
      if (shouldShowFavoritesShare) {
        songFavoritesShareBtn.style.removeProperty('display');
      } else {
        songFavoritesShareBtn.style.display = 'none';
      }
    }

    if (heroShareSongsBtn) {
      const shouldShowHeroShare = loggedIn && Array.isArray(songFavorites) && songFavorites.length > 0;
      heroShareSongsBtn.hidden = !shouldShowHeroShare;
      heroShareSongsBtn.disabled = !shouldShowHeroShare;
      heroShareSongsBtn.setAttribute('aria-hidden', shouldShowHeroShare ? 'false' : 'true');
      if (shouldShowHeroShare) {
        heroShareSongsBtn.style.removeProperty('display');
      } else {
        heroShareSongsBtn.style.display = 'none';
      }
    }

    if (customSongsAddBtn) {
      const shouldShowCustomSongAdd = loggedIn;
      customSongsAddBtn.hidden = !shouldShowCustomSongAdd;
      customSongsAddBtn.disabled = !shouldShowCustomSongAdd || authRequestPending;
      customSongsAddBtn.setAttribute('aria-hidden', shouldShowCustomSongAdd ? 'false' : 'true');
      if (shouldShowCustomSongAdd) {
        customSongsAddBtn.style.removeProperty('display');
      } else {
        customSongsAddBtn.style.display = 'none';
      }
    }
  };

  const syncSongShareImportButtonState = () => {
    if (!songShareImportBtn) return;
    const safeShareId = normalizeSongShareId(songShareCurrentViewId || readSongShareIdFromUrl());
    const shouldShow = Boolean(songShareViewModeLoaded && safeShareId && !isAuthLoggedIn());
    songShareImportBtn.hidden = !shouldShow;
    songShareImportBtn.disabled = !shouldShow || songShareImportPending || authRequestPending;
    songShareImportBtn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (shouldShow) {
      songShareImportBtn.style.removeProperty('display');
    } else {
      songShareImportBtn.style.display = 'none';
    }
  };

  const persistAuthState = () => {
    try {
      if (authToken) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      const normalizedUser = normalizeAuthUser(authUser);
      if (normalizedUser) {
        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
      } else {
        window.localStorage.removeItem(AUTH_USER_KEY);
      }
    } catch (err) {
      return;
    }
  };

  const clearAuthSessionHealthcheckTimer = () => {
    if (authSessionHealthcheckTimerId) {
      window.clearTimeout(authSessionHealthcheckTimerId);
      authSessionHealthcheckTimerId = null;
    }
  };

  const clearAuthState = () => {
    authToken = '';
    authUser = null;
    clearAuthSessionHealthcheckTimer();
    persistAuthState();
  };

  const extractApiErrorMessage = (payload, fallbackMessage) => {
    const fallback = String(fallbackMessage || 'Erro inesperado.');
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = payload.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim();
    }
    if (detail && typeof detail === 'object') {
      const detailMessage = detail.message;
      if (typeof detailMessage === 'string' && detailMessage.trim()) {
        return detailMessage.trim();
      }
    }

    const message = payload.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    return fallback;
  };

  const requestAuthJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(extractApiErrorMessage(payload, 'Falha ao autenticar.'));
    }

    return payload && typeof payload === 'object' ? payload : {};
  };

  const buildUserScopedApiHeaders = (headers = {}) => {
    const mergedHeaders = headers && typeof headers === 'object' ? { ...headers } : {};
    const safeToken = String(authToken || '').trim();
    if (safeToken) {
      mergedHeaders.Authorization = `Bearer ${safeToken}`;
    }
    return mergedHeaders;
  };

  const isUserScopedApiUnauthorized = (response) => Number(response?.status) === 401;

  const handleUserScopedApiUnauthorized = (options = {}) => {
    const {
      notify = false,
      openLoginModal = false,
      message = 'Sessão expirada. Faça login novamente.',
      trigger = null,
    } = asObject(options);
    clearAuthState();
    renderAuthMenu();
    clearUserScopedSongData();
    closeAuthModal({ restoreFocus: false });
    closeAuthSessionsModal({ restoreFocus: false });
    closeSongShareModal({ restoreFocus: false });
    closeSongShareMergeModal({ action: SONG_SHARE_MERGE_ACTION_DISMISS, excludeConflictKeys: [] });
    closeAuthDropdown();
    closeMainMenu();
    if (notify) {
      showSongToast(String(message || 'Sessão expirada. Faça login novamente.'), 'is-warning');
    }
    if (openLoginModal) {
      openAuthModal('login', trigger instanceof HTMLElement ? trigger : null);
    }
  };

  const scheduleAuthSessionHealthcheck = (delayMs = AUTH_SESSION_HEALTHCHECK_INTERVAL_MS) => {
    clearAuthSessionHealthcheckTimer();
    if (!isAuthLoggedIn()) return;
    const safeDelay = Number.isFinite(delayMs) ? Math.max(2500, Math.trunc(delayMs)) : AUTH_SESSION_HEALTHCHECK_INTERVAL_MS;
    authSessionHealthcheckTimerId = window.setTimeout(() => {
      authSessionHealthcheckTimerId = null;
      void runAuthSessionHealthcheck();
    }, safeDelay);
  };

  const runAuthSessionHealthcheck = async () => {
    if (!isAuthLoggedIn()) {
      clearAuthSessionHealthcheckTimer();
      return;
    }
    if (document.visibilityState === 'hidden') {
      scheduleAuthSessionHealthcheck(AUTH_SESSION_HEALTHCHECK_INTERVAL_MS);
      return;
    }
    if (authSessionHealthcheckInFlight) {
      scheduleAuthSessionHealthcheck(3000);
      return;
    }

    authSessionHealthcheckInFlight = true;
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: 'no-store',
      });
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized({
          notify: true,
          openLoginModal: false,
          message: 'Sessão expirada. Faça login novamente.',
        });
        return;
      }
      if (response.ok) {
        let payload = null;
        try {
          payload = await response.json();
        } catch (_err) {
          payload = null;
        }
        const normalizedUser = normalizeAuthUser(payload?.user);
        if (normalizedUser) {
          authUser = normalizedUser;
          persistAuthState();
          renderAuthMenu();
        }
      }
    } catch (_err) {
      // Ignore transient network failures and retry on next cycle.
    } finally {
      authSessionHealthcheckInFlight = false;
      if (isAuthLoggedIn()) {
        scheduleAuthSessionHealthcheck(AUTH_SESSION_HEALTHCHECK_INTERVAL_MS);
      }
    }
  };

  const ensureLoggedInForUserScopedAction = (options = {}) => {
    if (isAuthLoggedIn()) return true;
    const {
      message = 'Faça login para continuar.',
      trigger = null,
      notify = true,
    } = asObject(options);
    if (notify) {
      showSongToast(String(message || 'Faça login para continuar.'), 'is-warning');
    }
    openAuthModal('login', trigger instanceof HTMLElement ? trigger : null);
    return false;
  };

  const setAuthFormFeedback = (message = '') => {
    if (!authFormFeedback) return;
    const safeMessage = String(message || '').trim();
    authFormFeedback.textContent = safeMessage;
    authFormFeedback.hidden = !safeMessage;
  };

  const suggestNameFromEmail = (email = '') => {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail || !safeEmail.includes('@')) return '';
    const localPart = safeEmail.split('@')[0] || '';
    const normalized = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    const maxLen = 150;
    if (normalized.length <= maxLen) return normalized;
    return normalized.slice(0, maxLen).trim();
  };

  const normalizeAuthPrefill = (value = {}) => {
    const safeValue = asObject(value);
    const email = String(safeValue.email || '').trim().toLowerCase();
    const password = String(safeValue.password || '');
    const nameCandidate = String(safeValue.name || '').trim();
    const name = nameCandidate || suggestNameFromEmail(email);
    return { name, email, password };
  };

  const setAuthRegisterCtaState = (visible, prefill = null) => {
    if (!authRegisterCtaBtn) return;
    const shouldShow = Boolean(visible);
    const safeMode = normalizeAuthMode(authMode);
    const isRegisterMode = safeMode === 'register';
    const ctaLabel = isRegisterMode ? 'Entrar' : 'Registrar';
    const ctaAria = isRegisterMode ? 'Ir para login' : 'Ir para registro';
    authRegisterCtaBtn.textContent = ctaLabel;
    authRegisterCtaBtn.setAttribute('aria-label', ctaAria);
    authRegisterCtaBtn.setAttribute('title', ctaAria);
    authRegisterCtaBtn.hidden = !shouldShow;
    authRegisterCtaBtn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    const actions = authForm ? authForm.querySelector('.auth-form-actions') : null;
    if (actions instanceof HTMLElement) {
      actions.classList.toggle('has-register-cta', shouldShow);
    }
    if (shouldShow) {
      pendingAuthRegisterPrefill = normalizeAuthPrefill(prefill);
    } else {
      pendingAuthRegisterPrefill = null;
    }
  };

  const setAuthPasswordVisibility = (visible) => {
    if (!authPasswordInput || !authPasswordToggle) return;
    const isVisible = Boolean(visible);
    authPasswordInput.type = isVisible ? 'text' : 'password';
    authPasswordToggle.classList.toggle('is-visible', isVisible);
    authPasswordToggle.setAttribute('aria-pressed', String(isVisible));
    const label = isVisible ? 'Ocultar senha' : 'Exibir senha';
    authPasswordToggle.setAttribute('aria-label', label);
    authPasswordToggle.setAttribute('title', label);
  };

  const buildAuthQrImageUrl = (rawApproveUrl = '') => {
    const safeValue = String(rawApproveUrl || '').trim();
    if (!safeValue) return '';
    return safeValue;
  };

  const clearAuthQrPollTimer = () => {
    if (authQrPollTimerId) {
      window.clearTimeout(authQrPollTimerId);
      authQrPollTimerId = null;
    }
  };

  const setAuthQrStatusMessage = (message = '', type = '') => {
    if (!authQrStatus) return;
    const safeMessage = String(message || '').trim();
    const safeType = String(type || '').trim();
    authQrStatus.textContent = safeMessage;
    authQrStatus.classList.remove('is-warning', 'is-success', 'is-error', 'is-loading');
    if (safeType) authQrStatus.classList.add(safeType);
    authQrStatus.hidden = !safeMessage;
  };

  const setAuthQrRequestState = (pending) => {
    authQrRequestPending = Boolean(pending);
    const disabled = authQrRequestPending || authRequestPending;
    if (authQrOpenBtn) authQrOpenBtn.disabled = disabled;
    if (authQrRefreshBtn) authQrRefreshBtn.disabled = disabled;
    if (authQrCloseBtn) authQrCloseBtn.disabled = authQrRequestPending;
  };

  const resetAuthQrSessionState = () => {
    clearAuthQrPollTimer();
    authQrCompletePending = false;
    authQrPollInFlight = false;
    authQrSessionGuid = '';
    authQrPollToken = '';
    authQrApproveUrl = '';
    authQrExpiresAtUtc = '';
    if (authQrImage) {
      authQrImage.removeAttribute('src');
    }
    setAuthQrStatusMessage('');
    setAuthQrRequestState(false);
  };

  const readAuthQrApprovalFromUrl = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const sessionGuid = String(currentUrl.searchParams.get(AUTH_QR_QUERY_SESSION_KEY) || '').trim();
      const approveToken = String(currentUrl.searchParams.get(AUTH_QR_QUERY_TOKEN_KEY) || '').trim();
      if (!sessionGuid || !approveToken) return null;
      return { sessionGuid, approveToken };
    } catch (_err) {
      return null;
    }
  };

  const clearAuthQrApprovalFromUrl = () => {
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete(AUTH_QR_QUERY_SESSION_KEY);
      currentUrl.searchParams.delete(AUTH_QR_QUERY_TOKEN_KEY);
      const nextQuery = currentUrl.searchParams.toString();
      const nextUrl = `${currentUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${currentUrl.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    } catch (_err) {
      return;
    }
  };

  const maybeHandlePendingAuthQrApproval = async (triggerElement = null) => {
    if (!pendingAuthQrApproval || authQrApprovalHandling) return false;
    if (!isAuthLoggedIn()) return false;
    const safePending = asObject(pendingAuthQrApproval);
    const sessionGuid = String(safePending.sessionGuid || '').trim();
    const approveToken = String(safePending.approveToken || '').trim();
    if (!sessionGuid || !approveToken) {
      pendingAuthQrApproval = null;
      clearAuthQrApprovalFromUrl();
      return false;
    }

    authQrApprovalHandling = true;
    try {
      const shouldApprove = await openFavoriteConfirmModal({
        triggerElement: triggerElement instanceof HTMLElement ? triggerElement : null,
        title: 'Autorizar login por QR Code',
        message: 'Deseja autorizar o login no computador usando sua conta atual?',
        acceptLabel: 'Autorizar',
        cancelLabel: 'Cancelar',
        requirePassword: false,
      });
      if (!shouldApprove) {
        showSongToast('Aprovacao de QR Code cancelada.', 'is-warning');
        pendingAuthQrApproval = null;
        clearAuthQrApprovalFromUrl();
        return false;
      }

      await requestAuthJson('/api/auth/qr/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          session_guid: sessionGuid,
          approve_token: approveToken,
        }),
      });
      showSongToast('Login no computador autorizado.', 'is-success');
      pendingAuthQrApproval = null;
      clearAuthQrApprovalFromUrl();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao autorizar QR Code.';
      showSongToast(message, 'is-error');
      return false;
    } finally {
      authQrApprovalHandling = false;
    }
  };

  const completeAuthQrLogin = async () => {
    if (authQrCompletePending || !authQrSessionGuid || !authQrPollToken) return false;
    authQrCompletePending = true;
    setAuthQrStatusMessage('Confirmando login...', 'is-loading');
    setAuthQrRequestState(true);
    try {
      const payload = await requestAuthJson('/api/auth/qr/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_guid: authQrSessionGuid,
          poll_token: authQrPollToken,
        }),
      });
      applyAuthPayload(payload);
      authQrPanelOpen = false;
      syncAuthFormMode(authMode);
      resetAuthQrSessionState();
      closeAuthModal({ restoreFocus: false });
      showSongToast('Login por QR Code realizado com sucesso.', 'is-success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao concluir login por QR Code.';
      setAuthQrStatusMessage(message, 'is-error');
      setAuthQrRequestState(false);
      return false;
    } finally {
      authQrCompletePending = false;
    }
  };

  const pollAuthQrStatus = async () => {
    clearAuthQrPollTimer();
    if (!authQrPanelOpen || !authQrSessionGuid || !authQrPollToken || authQrPollInFlight) return;
    authQrPollInFlight = true;
    try {
      const query = new URLSearchParams({
        session_guid: authQrSessionGuid,
        poll_token: authQrPollToken,
      }).toString();
      const payload = await requestAuthJson(`/api/auth/qr/status?${query}`, {
        method: 'GET',
      });
      const status = String(payload.status || '').trim().toLowerCase();
      const expiresAtUtc = String(payload.expires_at_utc || '').trim();
      authQrExpiresAtUtc = expiresAtUtc || authQrExpiresAtUtc;
      if (status === AUTH_QR_STATUS_APPROVED) {
        setAuthQrStatusMessage('Aprovado no celular. Finalizando login...', 'is-success');
        await completeAuthQrLogin();
        return;
      }
      if (status === AUTH_QR_STATUS_EXPIRED) {
        setAuthQrStatusMessage('QR Code expirado. Gere um novo para continuar.', 'is-warning');
        return;
      }
      if (status === AUTH_QR_STATUS_CONSUMED) {
        setAuthQrStatusMessage('QR Code ja utilizado. Gere um novo para continuar.', 'is-warning');
        return;
      }

      let countdownText = '';
      if (authQrExpiresAtUtc) {
        const expiresAtMs = Date.parse(authQrExpiresAtUtc);
        if (Number.isFinite(expiresAtMs)) {
          const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
          if (remainingSeconds > 0) {
            countdownText = ` (${remainingSeconds}s)`;
          }
        }
      }
      setAuthQrStatusMessage(`Aguardando aprovacao no celular${countdownText}.`, 'is-loading');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao consultar QR Code.';
      setAuthQrStatusMessage(message, 'is-error');
      return;
    } finally {
      authQrPollInFlight = false;
    }

    if (!authQrPanelOpen || authQrCompletePending) return;
    authQrPollTimerId = window.setTimeout(() => {
      void pollAuthQrStatus();
    }, AUTH_QR_POLL_INTERVAL_MS);
  };

  const startAuthQrLogin = async () => {
    if (authQrRequestPending || authRequestPending) return;
    resetAuthQrSessionState();
    setAuthQrRequestState(true);
    setAuthQrStatusMessage('Gerando QR Code...', 'is-loading');
    try {
      const payload = await requestAuthJson('/api/auth/qr/start', {
        method: 'POST',
      });
      const nextSessionGuid = String(payload.session_guid || '').trim();
      const nextPollToken = String(payload.poll_token || '').trim();
      const nextApproveUrl = String(payload.approve_url || '').trim();
      const nextQrImageDataUrl = String(payload.qr_image_data_url || '').trim();
      const nextExpiresAtUtc = String(payload.expires_at_utc || '').trim();
      if (!nextSessionGuid || !nextPollToken || !nextApproveUrl || !nextQrImageDataUrl) {
        throw new Error('Falha ao gerar QR Code de autenticacao.');
      }

      authQrSessionGuid = nextSessionGuid;
      authQrPollToken = nextPollToken;
      authQrApproveUrl = nextApproveUrl;
      authQrExpiresAtUtc = nextExpiresAtUtc;
      if (authQrImage) {
        authQrImage.src = buildAuthQrImageUrl(nextQrImageDataUrl);
      }
      setAuthQrStatusMessage('Escaneie o QR Code com o celular para autorizar.', 'is-loading');
      setAuthQrRequestState(false);
      void pollAuthQrStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao iniciar login por QR Code.';
      setAuthQrStatusMessage(message, 'is-error');
      setAuthQrRequestState(false);
    }
  };

  const isAuthSessionUnauthorizedMessage = (message = '') => {
    const safeMessage = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!safeMessage) return false;
    return (
      safeMessage.includes('sessao invalida')
      || safeMessage.includes('sessao expirada')
      || safeMessage.includes('autenticacao obrigatoria')
      || safeMessage.includes('token de autenticacao')
    );
  };

  const setAuthSessionsFeedback = (message = '', type = '') => {
    if (!authSessionsFeedback) return;
    const safeMessage = String(message || '').trim();
    const safeType = String(type || '').trim();
    authSessionsFeedback.textContent = safeMessage;
    authSessionsFeedback.classList.remove('is-success', 'is-warning', 'is-error', 'is-loading');
    if (safeType) authSessionsFeedback.classList.add(safeType);
    authSessionsFeedback.hidden = !safeMessage;
  };

  const formatAuthSessionDateTime = (value) => {
    const safeValue = String(value || '').trim();
    if (!safeValue) return '';
    const timestamp = Date.parse(safeValue);
    if (!Number.isFinite(timestamp)) return '';
    const locale = String(navigator.language || 'pt-PT').trim() || 'pt-PT';
    try {
      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    } catch (_err) {
      return new Date(timestamp).toLocaleString();
    }
  };

  const normalizeAuthSessionEntry = (entry) => {
    const safeEntry = entry && typeof entry === 'object' ? entry : {};
    const sessionGuid = String(safeEntry.session_guid || safeEntry.sessionGuid || '').trim();
    if (!sessionGuid) return null;
    return {
      sessionGuid,
      userAgent: String(safeEntry.user_agent || safeEntry.userAgent || '').trim(),
      ipAddress: String(safeEntry.ip_address || safeEntry.ipAddress || '').trim(),
      createdAtUtc: String(safeEntry.created_at_utc || safeEntry.createdAtUtc || '').trim(),
      expiresAtUtc: String(safeEntry.expires_at_utc || safeEntry.expiresAtUtc || '').trim(),
      isCurrent: Boolean(safeEntry.is_current || safeEntry.isCurrent),
    };
  };

  const normalizeAuthSessions = (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => normalizeAuthSessionEntry(entry))
      .filter((entry) => Boolean(entry));
  };

  const renderAuthSessionsList = (sessions = []) => {
    if (!authSessionsList) return;
    authSessionsList.innerHTML = '';
    if (!Array.isArray(sessions) || !sessions.length) return;

    const fragment = document.createDocumentFragment();
    sessions.forEach((entry) => {
      const session = normalizeAuthSessionEntry(entry);
      if (!session) return;

      const listItem = document.createElement('li');
      listItem.className = 'auth-sessions-item';
      if (session.isCurrent) {
        listItem.classList.add('is-current');
      }
      listItem.dataset.sessionGuid = session.sessionGuid;

      const row = document.createElement('div');
      row.className = 'auth-sessions-item-row';

      const details = document.createElement('div');
      details.className = 'auth-sessions-item-details';

      const createdLabel = formatAuthSessionDateTime(session.createdAtUtc);
      const expiresLabel = formatAuthSessionDateTime(session.expiresAtUtc);
      const createdMeta = `Inicio ${createdLabel || 'indisponivel'}`;
      const expiresMeta = `Expira ${expiresLabel || 'indisponivel'}`;

      const meta = document.createElement('p');
      meta.className = 'auth-sessions-item-meta';
      meta.textContent = `${createdMeta} | ${expiresMeta}`;
      details.appendChild(meta);

      row.appendChild(details);

      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'btn btn-ghost auth-sessions-item-action';
      actionButton.dataset.authSessionLogout = session.sessionGuid;
      actionButton.textContent = session.isCurrent ? 'Sair desta sessão' : 'Encerrar';
      row.appendChild(actionButton);

      if (session.isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'auth-sessions-item-badge';
        badge.textContent = 'Este dispositivo';
        details.appendChild(badge);
      }

      listItem.appendChild(row);
      fragment.appendChild(listItem);
    });

    authSessionsList.appendChild(fragment);
  };

  const setAuthSessionsRequestState = (pending) => {
    authSessionsRequestPending = Boolean(pending);

    if (authSessionsCloseButtons.length) {
      authSessionsCloseButtons.forEach((button) => {
        button.disabled = authSessionsRequestPending;
      });
    }

    if (authSessionsList) {
      const actionButtons = authSessionsList.querySelectorAll('.auth-sessions-item-action');
      actionButtons.forEach((button) => {
        const isTarget = String(button.dataset.authSessionLogout || '').trim() === authSessionsRevokePendingGuid;
        button.disabled = authSessionsRequestPending;
        if (!authSessionsRequestPending) {
          const row = button.closest('.auth-sessions-item');
          const isCurrent = Boolean(row && row.classList.contains('is-current'));
          button.textContent = isCurrent ? 'Sair desta sessão' : 'Encerrar';
          return;
        }
        if (authSessionsRevokePendingGuid && isTarget) {
          button.textContent = 'Encerrando...';
        }
      });
    }
  };

  const closeAuthSessionsModal = (options = {}) => {
    if (!authSessionsModal) return;
    const { restoreFocus = true } = asObject(options);
    authSessionsModal.classList.remove('open');
    authSessionsModal.setAttribute('aria-hidden', 'true');
    authSessionsRevokePendingGuid = '';
    setAuthSessionsRequestState(false);
    setAuthSessionsFeedback('');
    renderAuthSessionsList([]);
    syncBodyModalLock();
    if (restoreFocus && lastFocusedAuthSessionsTrigger instanceof HTMLElement) {
      focusWithoutScrollingPage(lastFocusedAuthSessionsTrigger);
    }
    lastFocusedAuthSessionsTrigger = null;
  };

  const loadAuthSessions = async () => {
    if (!authSessionsModal || !authSessionsList) return;
    if (!isAuthLoggedIn()) {
      renderAuthSessionsList([]);
      setAuthSessionsFeedback('Faça login para visualizar suas sessões.', 'is-warning');
      return;
    }
    authSessionsRevokePendingGuid = '';
    setAuthSessionsRequestState(true);
    setAuthSessionsFeedback('Carregando sessões ativas...', 'is-loading');
    try {
      const payload = await requestAuthJson('/api/auth/sessions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const sessions = normalizeAuthSessions(payload.sessions);
      renderAuthSessionsList(sessions);
      if (!sessions.length) {
        setAuthSessionsFeedback('Nenhuma sessão ativa encontrada.', 'is-warning');
      } else {
        setAuthSessionsFeedback('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar sessões.';
      renderAuthSessionsList([]);
      setAuthSessionsFeedback(message, 'is-error');
      if (isAuthSessionUnauthorizedMessage(message)) {
        closeAuthSessionsModal({ restoreFocus: false });
        handleUserScopedApiUnauthorized({
          notify: true,
          openLoginModal: true,
          trigger: lastFocusedAuthSessionsTrigger,
        });
      }
    } finally {
      authSessionsRevokePendingGuid = '';
      setAuthSessionsRequestState(false);
    }
  };

  const openAuthSessionsModal = (triggerElement = null) => {
    if (!authSessionsModal) return;
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para gerenciar suas sessões.',
      trigger: triggerElement instanceof HTMLElement ? triggerElement : null,
      notify: true,
    })) {
      return;
    }

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedAuthSessionsTrigger = (
      triggerElement instanceof HTMLElement
        ? triggerElement
        : (activeElement || authMenuTrigger || null)
    );
    authSessionsModal.classList.add('open');
    authSessionsModal.setAttribute('aria-hidden', 'false');
    setAuthSessionsFeedback('');
    renderAuthSessionsList([]);
    syncBodyModalLock();
    void loadAuthSessions();
  };

  const handleAuthSessionLogout = async (sessionGuid, triggerButton = null) => {
    const safeSessionGuid = String(sessionGuid || '').trim();
    if (!safeSessionGuid || !isAuthLoggedIn()) return;

    const listItem = triggerButton instanceof HTMLElement
      ? triggerButton.closest('.auth-sessions-item')
      : null;
    const isCurrentSession = Boolean(listItem && listItem.classList.contains('is-current'));

    const shouldLogoutSession = await openFavoriteConfirmModal({
      triggerElement: triggerButton instanceof HTMLElement ? triggerButton : null,
      title: isCurrentSession ? 'Sair desta sessão' : 'Encerrar sessão',
      message: isCurrentSession
        ? 'Deseja sair desta sessão neste dispositivo?'
        : 'Deseja encerrar esta sessão ativa?',
      acceptLabel: isCurrentSession ? 'Sair' : 'Encerrar',
      cancelLabel: 'Cancelar',
      requirePassword: false,
    });
    if (!shouldLogoutSession) return;

    authSessionsRevokePendingGuid = safeSessionGuid;
    setAuthSessionsFeedback('');
    setAuthSessionsRequestState(true);
    try {
      const payload = await requestAuthJson(`/api/auth/sessions/${encodeURIComponent(safeSessionGuid)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const revokedCurrentSession = Boolean(payload.current_session_revoked);
      if (revokedCurrentSession) {
        closeAuthSessionsModal({ restoreFocus: false });
        await handleAuthLogout({
          callServer: false,
          toastMessage: 'Sessão expirada. Faça login novamente.',
          toastType: 'is-warning',
        });
        return;
      }

      showSongToast('Sessão encerrada.', 'is-success');
      await loadAuthSessions();
      setAuthSessionsFeedback('Sessão encerrada com sucesso.', 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao encerrar sessão.';
      setAuthSessionsFeedback(message, 'is-error');
      if (isAuthSessionUnauthorizedMessage(message)) {
        closeAuthSessionsModal({ restoreFocus: false });
        handleUserScopedApiUnauthorized({
          notify: true,
          openLoginModal: false,
          message: 'Sessão expirada. Faça login novamente.',
          trigger: triggerButton instanceof HTMLElement ? triggerButton : lastFocusedAuthSessionsTrigger,
        });
      }
    } finally {
      authSessionsRevokePendingGuid = '';
      setAuthSessionsRequestState(false);
    }
  };

  const setSongShareFeedback = (message = '', type = '') => {
    if (!songShareFeedback) return;
    const safeMessage = String(message || '').trim();
    const safeType = String(type || '').trim();
    songShareFeedback.textContent = safeMessage;
    songShareFeedback.classList.remove('is-warning', 'is-success', 'is-error', 'is-loading');
    if (safeType) songShareFeedback.classList.add(safeType);
    songShareFeedback.hidden = !safeMessage;
  };

  const formatSongShareCountsSummary = (rawCounts = {}) => {
    const counts = asObject(rawCounts);
    const parts = [];
    const customSongsCount = Number.parseInt(String(counts.custom_songs ?? ''), 10) || 0;
    const favoritesCount = Number.parseInt(String(counts.song_favorites ?? ''), 10) || 0;
    const mysteryCount = Number.parseInt(String(counts.mystery_song_assignments ?? ''), 10) || 0;
    const locationCount = Number.parseInt(String(counts.song_location_assignments ?? ''), 10) || 0;
    const locationNodesCount = Number.parseInt(String(counts.song_location_user_nodes ?? ''), 10) || 0;

    if (customSongsCount > 0) parts.push(`${customSongsCount} musicas personalizadas`);
    if (favoritesCount > 0) parts.push(`${favoritesCount} favoritos`);
    if (mysteryCount > 0) parts.push(`${mysteryCount} vinculos em misterios`);
    if (locationCount > 0) parts.push(`${locationCount} vinculos em locais`);
    if (locationNodesCount > 0) parts.push(`${locationNodesCount} categorias pessoais`);
    return parts.join(' | ');
  };

  const isSongShareNotFoundMessage = (message = '') => {
    const safeMessage = String(message || '').toLowerCase();
    if (!safeMessage) return false;
    return (
      safeMessage.includes('compartilhamento nao encontrado')
      || safeMessage.includes('codigo de compartilhamento invalido')
      || safeMessage.includes('informe o codigo de compartilhamento')
    );
  };

  const setSongShareRequestState = (pending) => {
    songShareRequestPending = Boolean(pending);
    const disableActions = songShareRequestPending || songShareImportPending;

    if (songShareCreateBtn) {
      songShareCreateBtn.disabled = disableActions;
      if (songShareRequestPending) {
        songShareCreateBtn.textContent = 'Gerando...';
      } else {
        songShareCreateBtn.textContent = 'Gerar novo link';
      }
    }
    if (songShareCopyBtn) {
      songShareCopyBtn.disabled = disableActions || !songShareCurrentLink;
    }
    if (songShareCloseButtons.length) {
      songShareCloseButtons.forEach((button) => {
        button.disabled = songShareRequestPending;
      });
    }
    if (songShareMergeImportBtn) {
      songShareMergeImportBtn.disabled = songShareRequestPending;
    }
    syncSongShareImportButtonState();
  };

  const applySongShareCreatePayload = (payload) => {
    const safePayload = asObject(payload);
    const shareUrl = String(safePayload.share_url || '').trim();
    const qrImageDataUrl = String(safePayload.qr_image_data_url || '').trim();
    if (!shareUrl || !qrImageDataUrl) {
      throw new Error('Resposta de compartilhamento invalida.');
    }

    songShareCurrentLink = shareUrl;
    if (songShareLinkInput) {
      songShareLinkInput.value = shareUrl;
    }
    if (songShareQrImage) {
      songShareQrImage.src = qrImageDataUrl;
    }

    const summary = formatSongShareCountsSummary(safePayload.counts);
    setSongShareFeedback(
      summary ? `Link pronto. Conteudo: ${summary}.` : 'Link pronto para compartilhamento.',
      'is-success'
    );
  };

  const closeSongShareModal = (options = {}) => {
    if (!songShareModal) return;
    const { restoreFocus = true } = asObject(options);
    songShareModal.classList.remove('open');
    songShareModal.setAttribute('aria-hidden', 'true');
    syncBodyModalLock();
    if (
      restoreFocus
      && lastFocusedSongShareTrigger instanceof HTMLElement
      && !hasAnyOpenModal()
    ) {
      focusWithoutScrollingPage(lastFocusedSongShareTrigger);
    }
    lastFocusedSongShareTrigger = null;
  };

  const setSongShareMergeFeedback = (message = '', type = '') => {
    if (!songShareMergeFeedback) return;
    const safeMessage = String(message || '').trim();
    const safeType = String(type || '').trim();
    songShareMergeFeedback.textContent = safeMessage;
    songShareMergeFeedback.classList.remove('is-error', 'is-loading');
    if (safeType) songShareMergeFeedback.classList.add(safeType);
    songShareMergeFeedback.hidden = !safeMessage;
  };

  const formatSongShareMergeSongLabel = (title = '', artist = '', songUrl = '') => {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();
    const safeUrl = String(songUrl || '').trim();
    if (safeTitle && safeArtist) return `${safeTitle} - ${safeArtist}`;
    if (safeTitle) return safeTitle;
    if (safeUrl) return safeUrl;
    return readSongMessage('defaultSongTitle');
  };

  const renderSongShareMergePreview = (previewPayload = {}) => {
    const safePayload = asObject(previewPayload);
    const safeCounts = asObject(safePayload.counts);
    const autoCounts = asObject(safeCounts.auto_import || safeCounts.autoImport);
    const unchangedCounts = asObject(safeCounts.unchanged);
    const conflictCounts = asObject(safeCounts.conflicts);
    const alwaysCandidates = asObject(safeCounts.always_candidates || safeCounts.alwaysCandidates);
    const totals = asObject(safePayload.totals);

    const parseCount = (rawValue) => Number.parseInt(String(rawValue ?? ''), 10) || 0;
    const autoTotal = parseCount(totals.auto_import ?? totals.autoImport);
    const unchangedTotal = parseCount(totals.unchanged);
    const conflictTotal = parseCount(totals.conflicts);

    if (songShareMergeSummary) {
      const summaryParts = [];
      if (autoTotal > 0) summaryParts.push(`${autoTotal} itens serao importados`);
      if (unchangedTotal > 0) summaryParts.push(`${unchangedTotal} ja estao iguais`);
      if (conflictTotal > 0) summaryParts.push(`${conflictTotal} conflitos para revisar`);
      if (!summaryParts.length) summaryParts.push('Nao ha diferencas para importar.');
      songShareMergeSummary.textContent = summaryParts.join(' | ');
    }

    if (songShareMergeAutoList) {
      songShareMergeAutoList.innerHTML = '';
      const autoItems = Array.isArray(safePayload.auto_import_items || safePayload.autoImportItems)
        ? (safePayload.auto_import_items || safePayload.autoImportItems)
        : [];
      autoItems.forEach((rawItem) => {
        const item = asObject(rawItem);
        const li = document.createElement('li');
        li.className = 'song-share-merge-item';

        const slotNode = document.createElement('p');
        slotNode.className = 'song-share-merge-item-slot';
        slotNode.textContent = String(item.slot_label || item.slotLabel || '').trim() || 'Item';

        const songNode = document.createElement('p');
        songNode.className = 'song-share-merge-item-song';
        songNode.textContent = formatSongShareMergeSongLabel(
          item.incoming_song_title || item.incomingSongTitle || '',
          item.incoming_song_artist || item.incomingSongArtist || '',
          item.incoming_song_url || item.incomingSongUrl || ''
        );

        li.appendChild(slotNode);
        li.appendChild(songNode);
        songShareMergeAutoList.appendChild(li);
      });

      if (!autoItems.length) {
        const li = document.createElement('li');
        li.className = 'song-share-merge-conflict-empty';
        li.textContent = 'Nenhum item novo sem conflito.';
        songShareMergeAutoList.appendChild(li);
      }

      const alwaysSummary = [];
      const customCandidates = parseCount(alwaysCandidates.custom_songs ?? alwaysCandidates.customSongs);
      const locationNodeCandidates = parseCount(
        alwaysCandidates.song_location_user_nodes ?? alwaysCandidates.songLocationUserNodes
      );
      if (customCandidates > 0) alwaysSummary.push(`${customCandidates} musicas personalizadas`);
      if (locationNodeCandidates > 0) alwaysSummary.push(`${locationNodeCandidates} categorias pessoais`);
      if (alwaysSummary.length) {
        const li = document.createElement('li');
        li.className = 'song-share-merge-conflict-empty';
        li.textContent = `Tambem serao importados da lista compartilhada: ${alwaysSummary.join(' | ')}.`;
        songShareMergeAutoList.appendChild(li);
      }
    }

    if (songShareMergeConflictsList) {
      songShareMergeConflictsList.innerHTML = '';
      const conflictItems = Array.isArray(safePayload.conflicts) ? safePayload.conflicts : [];
      conflictItems.forEach((rawItem) => {
        const item = asObject(rawItem);
        const conflictKey = String(item.key || '').trim();
        if (!conflictKey) return;

        const wrapper = document.createElement('label');
        wrapper.className = 'song-share-merge-conflict-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.conflictKey = conflictKey;

        const contentNode = document.createElement('div');
        contentNode.className = 'song-share-merge-item';

        const slotNode = document.createElement('p');
        slotNode.className = 'song-share-merge-item-slot';
        slotNode.textContent = String(item.slot_label || item.slotLabel || '').trim() || 'Conflito';

        const incomingNode = document.createElement('p');
        incomingNode.className = 'song-share-merge-item-song';
        incomingNode.textContent = `Importar: ${formatSongShareMergeSongLabel(
          item.incoming_song_title || item.incomingSongTitle || '',
          item.incoming_song_artist || item.incomingSongArtist || '',
          item.incoming_song_url || item.incomingSongUrl || ''
        )}`;

        const existingNode = document.createElement('p');
        existingNode.className = 'song-share-merge-item-existing';
        existingNode.textContent = `Atual: ${formatSongShareMergeSongLabel(
          item.existing_song_title || item.existingSongTitle || '',
          item.existing_song_artist || item.existingSongArtist || '',
          item.existing_song_url || item.existingSongUrl || ''
        )}`;

        contentNode.appendChild(slotNode);
        contentNode.appendChild(incomingNode);
        contentNode.appendChild(existingNode);
        wrapper.appendChild(checkbox);
        wrapper.appendChild(contentNode);
        songShareMergeConflictsList.appendChild(wrapper);
      });

      if (!conflictItems.length) {
        const emptyNode = document.createElement('p');
        emptyNode.className = 'song-share-merge-conflict-empty';
        emptyNode.textContent = 'Nenhum conflito encontrado. Pode importar com seguranca.';
        songShareMergeConflictsList.appendChild(emptyNode);
      }

      const conflictInfo = document.createElement('p');
      conflictInfo.className = 'song-share-merge-conflict-empty';
      conflictInfo.textContent = [
        `Favoritos: ${parseCount(conflictCounts.song_favorites ?? conflictCounts.songFavorites)}`,
        `Misterios: ${parseCount(conflictCounts.mystery_song_assignments ?? conflictCounts.mysterySongAssignments)}`,
        `Terco: ${parseCount(conflictCounts.song_location_assignments ?? conflictCounts.songLocationAssignments)}`
      ].join(' | ');
      songShareMergeConflictsList.appendChild(conflictInfo);

      const unchangedInfo = document.createElement('p');
      unchangedInfo.className = 'song-share-merge-conflict-empty';
      unchangedInfo.textContent = [
        `Iguais em favoritos: ${parseCount(unchangedCounts.song_favorites ?? unchangedCounts.songFavorites)}`,
        `Iguais em misterios: ${parseCount(unchangedCounts.mystery_song_assignments ?? unchangedCounts.mysterySongAssignments)}`,
        `Iguais no terco: ${parseCount(unchangedCounts.song_location_assignments ?? unchangedCounts.songLocationAssignments)}`
      ].join(' | ');
      songShareMergeConflictsList.appendChild(unchangedInfo);

      const autoInfo = document.createElement('p');
      autoInfo.className = 'song-share-merge-conflict-empty';
      autoInfo.textContent = [
        `Novos favoritos: ${parseCount(autoCounts.song_favorites ?? autoCounts.songFavorites)}`,
        `Novos misterios: ${parseCount(autoCounts.mystery_song_assignments ?? autoCounts.mysterySongAssignments)}`,
        `Novos no terco: ${parseCount(autoCounts.song_location_assignments ?? autoCounts.songLocationAssignments)}`
      ].join(' | ');
      songShareMergeConflictsList.appendChild(autoInfo);
    }
  };

  const resolvePendingSongShareMerge = (result = {}) => {
    if (!pendingSongShareMergeResolver) return;
    const resolve = pendingSongShareMergeResolver;
    pendingSongShareMergeResolver = null;
    resolve(asObject(result));
  };

  const closeSongShareMergeModal = (result = {}) => {
    const safeResult = asObject(result);
    if (!songShareMergeModal) {
      resolvePendingSongShareMerge(safeResult);
      return;
    }
    const focusTarget = lastFocusedSongShareMergeTrigger instanceof HTMLElement
      ? lastFocusedSongShareMergeTrigger
      : null;
    songShareMergeModal.classList.remove('open');
    songShareMergeModal.setAttribute('aria-hidden', 'true');
    setSongShareMergeFeedback('');
    syncBodyModalLock();
    resolvePendingSongShareMerge(safeResult);
    if (!hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedSongShareMergeTrigger = null;
  };

  const openSongShareMergeModal = (previewPayload, triggerElement = null) => {
    const safePayload = asObject(previewPayload);
    if (!songShareMergeModal || !songShareMergeConflictsList || !songShareMergeImportBtn) {
      const shouldImport = window.confirm('Importar itens compartilhados para sua conta?');
      if (!shouldImport) {
        return Promise.resolve({
          action: SONG_SHARE_MERGE_ACTION_CANCEL,
          excludeConflictKeys: [],
        });
      }
      return Promise.resolve({
        action: SONG_SHARE_MERGE_ACTION_ACCEPT,
        excludeConflictKeys: [],
      });
    }

    if (pendingSongShareMergeResolver) {
      resolvePendingSongShareMerge({
        action: SONG_SHARE_MERGE_ACTION_DISMISS,
        excludeConflictKeys: [],
      });
    }

    renderSongShareMergePreview(safePayload);
    setSongShareMergeFeedback('');
    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedSongShareMergeTrigger = (
      triggerElement instanceof HTMLElement
        ? triggerElement
        : fallbackFocus
    );
    songShareMergeModal.classList.add('open');
    songShareMergeModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    window.requestAnimationFrame(() => {
      focusWithoutScrollingPage(songShareMergeImportBtn);
    });

    return new Promise((resolve) => {
      pendingSongShareMergeResolver = resolve;
    });
  };

  const requestSongShareMergePreview = async (shareId) => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) {
      throw new Error('Codigo de compartilhamento invalido.');
    }
    const query = new URLSearchParams({ share_id: safeShareId }).toString();
    const response = await fetch(`/api/songs/share/merge-preview?${query}`, {
      method: 'GET',
      headers: buildUserScopedApiHeaders(),
      cache: 'no-store',
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(extractApiErrorMessage(payload, 'Falha ao validar importacao compartilhada.'));
    }
    return asObject(payload);
  };

  const fetchSongSharePreview = async (shareId) => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) {
      throw new Error('Codigo de compartilhamento invalido.');
    }
    const query = new URLSearchParams({ share_id: safeShareId }).toString();
    const response = await fetch(`/api/songs/share/preview?${query}`, {
      method: 'GET',
      cache: 'no-store',
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(extractApiErrorMessage(payload, 'Falha ao ler compartilhamento.'));
    }
    return asObject(payload);
  };

  const requestSongShareImport = async (shareId, options = {}) => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) {
      throw new Error('Codigo de compartilhamento invalido.');
    }
    const safeOptions = asObject(options);
    const excludeConflictKeys = Array.isArray(safeOptions.excludeConflictKeys)
      ? safeOptions.excludeConflictKeys
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
      : [];
    const response = await fetch('/api/songs/share/import', {
      method: 'POST',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        share_id: safeShareId,
        exclude_conflict_keys: excludeConflictKeys,
      }),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }

    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(extractApiErrorMessage(payload, 'Falha ao importar compartilhamento.'));
    }
    return asObject(payload);
  };

  const requestSongShareView = async (shareId) => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) {
      throw new Error('Codigo de compartilhamento invalido.');
    }
    const query = new URLSearchParams({ share_id: safeShareId }).toString();
    const response = await fetch(`/api/songs/share/view?${query}`, {
      method: 'GET',
      cache: 'no-store',
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }
    if (!response.ok || !payload?.ok) {
      throw new Error(extractApiErrorMessage(payload, 'Falha ao carregar compartilhamento.'));
    }
    return asObject(payload);
  };

  const buildSongShareViewFavoriteRows = (
    favoriteRows = [],
    mysteryRows = [],
    locationRows = []
  ) => {
    const nextRows = [];
    const seenUrlKeys = new Set();
    const appendRow = (rawPayload) => {
      const payload = asObject(rawPayload);
      const songUrl = String(payload.url || payload.song_url || payload.songUrl || '').trim();
      const songUrlKey = normalizeSongUrlKey(songUrl);
      if (!songUrlKey || seenUrlKeys.has(songUrlKey)) return;
      seenUrlKeys.add(songUrlKey);

      nextRows.push({
        id: payload.id ?? 0,
        order_index: payload.order_index ?? payload.orderIndex ?? 0,
        url: songUrl,
        title: String(payload.title || payload.song_title || payload.songTitle || '').trim(),
        artist: String(payload.artist || payload.song_artist || payload.songArtist || '').trim(),
        source: String(payload.source || '').trim(),
        source_label: String(payload.source_label || payload.sourceLabel || '').trim(),
        image_url: String(payload.image_url || payload.imageUrl || '').trim(),
        spotify_url: String(payload.spotify_url || payload.spotifyUrl || '').trim(),
        youtube_url: String(payload.youtube_url || payload.youtubeUrl || '').trim(),
        lyrics_text: String(payload.lyrics_text || payload.lyricsText || ''),
        lyrics_source: String(payload.lyrics_source || payload.lyricsSource || '').trim(),
        lyrics_source_url: String(payload.lyrics_source_url || payload.lyricsSourceUrl || '').trim(),
        chords_text: String(payload.chords_text || payload.chordsText || ''),
        chords_source: String(payload.chords_source || payload.chordsSource || '').trim(),
        chords_source_url: String(payload.chords_source_url || payload.chordsSourceUrl || '').trim(),
        chords_original_key: String(payload.chords_original_key || payload.chordsOriginalKey || '').trim(),
        chords_selected_key: String(payload.chords_selected_key || payload.chordsSelectedKey || '').trim(),
        created_at_utc: String(payload.created_at_utc || payload.createdAtUtc || '').trim(),
        updated_at_utc: String(payload.updated_at_utc || payload.updatedAtUtc || '').trim(),
        has_lyrics: Boolean(
          payload.has_lyrics
          || payload.hasLyrics
          || String(payload.lyrics_text || payload.lyricsText || '').trim()
        ),
        has_chords: Boolean(
          payload.has_chords
          || payload.hasChords
          || String(payload.chords_text || payload.chordsText || '').trim()
        ),
      });
    };

    (Array.isArray(favoriteRows) ? favoriteRows : []).forEach(appendRow);
    (Array.isArray(mysteryRows) ? mysteryRows : []).forEach(appendRow);
    (Array.isArray(locationRows) ? locationRows : []).forEach(appendRow);
    return nextRows;
  };

  const applySongShareViewPayload = (payload) => {
    const safePayload = asObject(payload);
    const shareIdFromPayload = normalizeSongShareId(safePayload.share_id || readSongShareIdFromUrl());
    if (shareIdFromPayload) {
      songShareCurrentViewId = shareIdFromPayload;
      pendingSongShareImport = shareIdFromPayload;
    }
    let shareUrl = String(safePayload.share_url || '').trim();
    const qrImageDataUrl = String(safePayload.qr_image_data_url || '').trim();
    if (!shareUrl) {
      const shareIdFromPayload = normalizeSongShareId(safePayload.share_id || '');
      if (shareIdFromPayload) {
        try {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set(SONG_SHARE_QUERY_KEY, shareIdFromPayload);
          shareUrl = currentUrl.toString();
        } catch (_err) {
          shareUrl = '';
        }
      }
    }
    songShareCurrentLink = shareUrl;
    if (songShareLinkInput) {
      songShareLinkInput.value = shareUrl;
    }
    if (songShareQrImage) {
      if (qrImageDataUrl) {
        songShareQrImage.src = qrImageDataUrl;
      } else {
        songShareQrImage.removeAttribute('src');
      }
    }

    const shareData = asObject(safePayload.data);
    const songFavoritesRows = Array.isArray(shareData.song_favorites) ? shareData.song_favorites : [];
    const customSongsRows = Array.isArray(shareData.custom_songs) ? shareData.custom_songs : [];
    const mysteryAssignmentsRows = Array.isArray(shareData.mystery_song_assignments)
      ? shareData.mystery_song_assignments
      : [];
    const locationAssignmentsRows = Array.isArray(shareData.song_location_assignments)
      ? shareData.song_location_assignments
      : [];
    const locationUserNodesRows = Array.isArray(shareData.song_location_user_nodes)
      ? shareData.song_location_user_nodes
      : [];
    const combinedSongRows = buildSongShareViewFavoriteRows(
      songFavoritesRows,
      mysteryAssignmentsRows,
      locationAssignmentsRows
    );

    const userNodesById = new Map();
    locationUserNodesRows.forEach((rawNode) => {
      const normalizedNode = normalizeSongLocationNodePayload(rawNode);
      const normalizedId = String(normalizedNode.id || '')
        .trim()
        .replace(/^location:/i, '')
        .trim();
      if (!normalizedId || !normalizedNode.label) return;
      userNodesById.set(normalizedId, normalizedNode);
    });

    const resolveSharedLocationPath = (rawLocationId) => {
      let currentId = String(rawLocationId || '')
        .trim()
        .replace(/^location:/i, '')
        .trim();
      if (!currentId) return [];

      const path = [];
      const visited = new Set();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const node = userNodesById.get(currentId);
        if (!node || !node.label) break;
        path.unshift(node.label);
        currentId = String(node.parentId || '')
          .trim()
          .replace(/^location:/i, '')
          .trim();
      }
      return path;
    };

    const nextMysteryAssignments = {};
    mysteryAssignmentsRows.forEach((rowPayload) => {
      const normalized = normalizeMysterySongAssignmentPayload(rowPayload);
      if (!normalized.groupTitle || !normalized.mysteryTitle) return;
      const key = buildMysterySongAssignmentKey(normalized.groupTitle, normalized.mysteryTitle);
      nextMysteryAssignments[key] = normalized;
    });

    const nextLocationAssignments = {};
    locationAssignmentsRows.forEach((rowPayload) => {
      const normalized = normalizeSongLocationAssignmentPayload(rowPayload);
      if (!normalized.locationId) return;
      if (!normalized.locationPath.length) {
        normalized.locationPath = resolveSharedLocationPath(normalized.locationId);
      }
      nextLocationAssignments[normalized.locationId] = normalized;
    });

    songFavoritesLoading = false;
    mysterySongAssignmentsLoading = false;
    songLocationAssignmentsLoading = false;
    songShareViewModeLoaded = true;
    mysterySongAssignments = nextMysteryAssignments;
    songLocationAssignments = nextLocationAssignments;
    applySongFavorites(combinedSongRows);
    setPersistedCustomSongs(customSongsRows);
    syncStoredCustomDraftToSongList();
    renderCustomSongs();
    updateMysteryModalSongToggleState();
    renderSongSaveLocationPicker();
    updateRosaryModalSongToggleState();
    setSongShareRequestState(false);
    syncSongShareImportButtonState();
  };

  const buildSongShareImportToastMessage = (summaryPayload) => {
    const summary = asObject(summaryPayload);
    const customSongsAdded = Number.parseInt(String(asObject(summary.custom_songs).added ?? ''), 10) || 0;
    const mysteryApplied = Number.parseInt(String(asObject(summary.mystery_song_assignments).applied ?? ''), 10) || 0;
    const locationNodesAdded = Number.parseInt(String(asObject(summary.song_location_user_nodes).added ?? ''), 10) || 0;
    const locationApplied = Number.parseInt(String(asObject(summary.song_location_assignments).applied ?? ''), 10) || 0;
    const favoritesApplied = Number.parseInt(String(asObject(summary.song_favorites).applied ?? ''), 10) || 0;

    const parts = [];
    if (customSongsAdded > 0) parts.push(`${customSongsAdded} musicas personalizadas`);
    if (favoritesApplied > 0) parts.push(`${favoritesApplied} favoritos`);
    if (mysteryApplied > 0) parts.push(`${mysteryApplied} vinculos em misterios`);
    if (locationApplied > 0) parts.push(`${locationApplied} vinculos em locais`);
    if (locationNodesAdded > 0) parts.push(`${locationNodesAdded} categorias pessoais`);

    if (!parts.length) {
      return 'Importacao concluida. Nenhum item novo para adicionar.';
    }
    return `Importacao concluida: ${parts.join(', ')}.`;
  };

  const runSongShareMergeImportFlow = async (shareId, triggerElement = null) => {
    const safeShareId = normalizeSongShareId(shareId);
    if (!safeShareId) {
      throw new Error('Codigo de compartilhamento invalido.');
    }

    if (!isAuthLoggedIn()) {
      pendingSongShareImport = safeShareId;
      pendingSongShareMergeAfterLogin = true;
      showSongToast('Faça login para importar e escolher como resolver conflitos.', 'is-warning');
      runDeferredTask(() => {
        openAuthModal('login', triggerElement instanceof HTMLElement ? triggerElement : authMenuTrigger);
      }, 80);
      return false;
    }

    const previewPayload = await requestSongShareMergePreview(safeShareId);
    const previewSourcePayload = asObject(previewPayload.source);
    if (isSongShareOwnedByLoggedUser(previewSourcePayload)) {
      pendingSongShareImport = '';
      pendingSongShareMergeAfterLogin = false;
      persistLastSongShareViewId('');
      clearSongShareLocalState();
      clearSongShareFromUrl();
      await refreshUserScopedSongDataNow({ forceSongLists: true });
      showSongToast('Lista ja pertence a sua conta. Dados atualizados.', 'is-success');
      return true;
    }
    const decisionPayload = await openSongShareMergeModal(
      previewPayload,
      triggerElement instanceof HTMLElement ? triggerElement : null
    );
    const decision = asObject(decisionPayload);
    if (String(decision.action || SONG_SHARE_MERGE_ACTION_DISMISS) !== SONG_SHARE_MERGE_ACTION_ACCEPT) {
      setSongShareMergeFeedback('');
      pendingSongShareMergeAfterLogin = false;
      pendingSongShareImport = '';
      return false;
    }

    const excludeConflictKeys = Array.isArray(decision.excludeConflictKeys)
      ? decision.excludeConflictKeys.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const importPayload = await requestSongShareImport(safeShareId, { excludeConflictKeys });
    pendingSongShareImport = '';
    pendingSongShareMergeAfterLogin = false;
    persistLastSongShareViewId('');
    clearSongShareLocalState();
    clearSongShareFromUrl();
    await refreshUserScopedSongDataNow({ forceSongLists: true });
    showSongToast(buildSongShareImportToastMessage(importPayload.summary), 'is-success');
    return true;
  };

  const maybeHandlePendingSongShareImport = async (triggerElement = null) => {
    const safeShareId = normalizeSongShareId(pendingSongShareImport);
    if (!safeShareId || songShareImportPending) return false;

    songShareImportPending = true;
    setSongShareRequestState(songShareRequestPending);
    try {
      if (pendingSongShareMergeAfterLogin && isAuthLoggedIn()) {
        return await runSongShareMergeImportFlow(safeShareId, triggerElement);
      }

      const autoOpenView = Boolean(
        !isAuthLoggedIn()
        && shouldAutoOpenSongShareView(safeShareId)
      );
      if (autoOpenView) {
        const viewPayload = await requestSongShareView(safeShareId);
        applySongShareViewPayload(viewPayload);
        pendingSongShareImport = '';
        pendingSongShareMergeAfterLogin = false;
        return true;
      }

      const previewPayload = await fetchSongSharePreview(safeShareId);
      const sourcePayload = asObject(previewPayload.source);
      if (isSongShareOwnedByLoggedUser(sourcePayload)) {
        pendingSongShareImport = '';
        pendingSongShareMergeAfterLogin = false;
        persistLastSongShareViewId('');
        clearSongShareLocalState();
        clearSongShareFromUrl();
        await refreshUserScopedSongDataNow({ forceSongLists: true });
        showSongToast('Lista ja pertence a sua conta. Dados atualizados.', 'is-success');
        return true;
      }
      const sourceLabel = String(sourcePayload.name || '').trim();
      const countsSummary = formatSongShareCountsSummary(previewPayload.counts);
      const confirmationMessageBase = sourceLabel
        ? `Escolha como usar as musicas compartilhadas por ${sourceLabel}.`
        : 'Escolha como deseja usar essas musicas compartilhadas.';
      const confirmationActionHint = isAuthLoggedIn()
        ? 'Importar copia para sua conta. Ver usa a lista apenas neste navegador.'
        : 'Importar exige login. Ver abre a lista sem conta.';
      const confirmationMessage = countsSummary
        ? `${confirmationMessageBase}\n\nConteudo: ${countsSummary}.\n\n${confirmationActionHint}`
        : `${confirmationMessageBase}\n\n${confirmationActionHint}`;

      const selectedAction = await openFavoriteDecisionModal({
        triggerElement: triggerElement instanceof HTMLElement ? triggerElement : null,
        title: 'Musicas compartilhadas',
        message: confirmationMessage,
        acceptLabel: 'Importar',
        cancelLabel: 'Ver',
        fallbackCancelConfirmMessage: 'Deseja abrir em modo Ver sem importar?',
      });

      if (selectedAction === FAVORITE_CONFIRM_ACTION_DISMISS) {
        pendingSongShareImport = '';
        pendingSongShareMergeAfterLogin = false;
        persistLastSongShareViewId('');
        clearSongShareLocalState();
        clearSongShareFromUrl();
        return false;
      }

      if (selectedAction === FAVORITE_CONFIRM_ACTION_CANCEL) {
        const viewPayload = await requestSongShareView(safeShareId);
        applySongShareViewPayload(viewPayload);
        pendingSongShareImport = '';
        pendingSongShareMergeAfterLogin = false;
        persistLastSongShareViewId(safeShareId);
        showSongToast('Lista compartilhada carregada. Voce pode usar sem conta neste navegador.', 'is-success');
        return true;
      }

      if (!isAuthLoggedIn()) {
        showSongToast('Faça login para importar no seu usuario, ou escolha Ver para usar sem conta.', 'is-warning');
        pendingSongShareMergeAfterLogin = true;
        runDeferredTask(() => {
          openAuthModal('login', triggerElement instanceof HTMLElement ? triggerElement : authMenuTrigger);
        }, 80);
        return false;
      }

      pendingSongShareMergeAfterLogin = true;
      return await runSongShareMergeImportFlow(safeShareId, triggerElement);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao importar compartilhamento.';
      showSongToast(message, 'is-error');
      if (isSongShareNotFoundMessage(message)) {
        pendingSongShareImport = '';
        pendingSongShareMergeAfterLogin = false;
        persistLastSongShareViewId('');
        clearSongShareLocalState();
        clearSongShareFromUrl();
      }
      return false;
    } finally {
      songShareImportPending = false;
      setSongShareRequestState(songShareRequestPending);
    }
  };

  const createSongShareSnapshot = async () => {
    if (!songShareModal) return false;
    if (!isAuthLoggedIn()) return false;
    if (songShareRequestPending || songShareImportPending) return false;

    setSongShareFeedback('Gerando link de compartilhamento...', 'is-loading');
    setSongShareRequestState(true);
    try {
      const response = await fetch('/api/songs/share/create', {
        method: 'POST',
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (_err) {
        payload = null;
      }

      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(extractApiErrorMessage(payload, 'Falha ao gerar compartilhamento.'));
      }

      applySongShareCreatePayload(payload);
      setSongShareRequestState(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao gerar compartilhamento.';
      setSongShareFeedback(message, 'is-error');
      setSongShareRequestState(false);
      return false;
    }
  };

  const openSongShareModal = (triggerElement = null) => {
    if (!songShareModal) return;
    if (!isAuthLoggedIn()) {
      if (!ensureLoggedInForUserScopedAction({
        message: 'Faça login para compartilhar suas musicas.',
        trigger: triggerElement instanceof HTMLElement ? triggerElement : null,
        notify: true,
      })) {
        return;
      }
    }

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedSongShareTrigger = (
      triggerElement instanceof HTMLElement
        ? triggerElement
        : (activeElement || authMenuTrigger || null)
    );
    songShareModal.classList.add('open');
    songShareModal.setAttribute('aria-hidden', 'false');
    setSongShareFeedback('');
    syncBodyModalLock();
    void createSongShareSnapshot();
  };

  const copySongShareLink = async () => {
    const safeLink = String(songShareCurrentLink || songShareLinkInput?.value || '').trim();
    if (!safeLink) {
      setSongShareFeedback('Gere um link antes de copiar.', 'is-warning');
      return false;
    }

    const fallbackCopy = () => {
      if (!(songShareLinkInput instanceof HTMLInputElement)) return false;
      songShareLinkInput.focus();
      songShareLinkInput.select();
      songShareLinkInput.setSelectionRange(0, songShareLinkInput.value.length);
      try {
        return document.execCommand('copy');
      } catch (_err) {
        return false;
      }
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(safeLink);
      } else if (!fallbackCopy()) {
        throw new Error('Nao foi possivel copiar o link.');
      }
      setSongShareFeedback('Link copiado para a area de transferencia.', 'is-success');
      return true;
    } catch (err) {
      const copied = fallbackCopy();
      if (copied) {
        setSongShareFeedback('Link copiado para a area de transferencia.', 'is-success');
        return true;
      }
      const message = err instanceof Error ? err.message : 'Nao foi possivel copiar o link.';
      setSongShareFeedback(message, 'is-error');
      return false;
    }
  };

  const normalizeAuthMode = (mode = 'login') => {
    const safeMode = String(mode || '').trim().toLowerCase();
    if (safeMode === 'register') return 'register';
    if (safeMode === 'account') return 'account';
    return 'login';
  };

  const syncAuthFormMode = (mode = 'login') => {
    const normalizedMode = normalizeAuthMode(mode);
    const isLoginMode = normalizedMode === 'login';
    const isRegisterMode = normalizedMode === 'register';
    const isAccountMode = normalizedMode === 'account';
    if (!isLoginMode && authQrPanelOpen) {
      authQrPanelOpen = false;
      resetAuthQrSessionState();
    }
    const showQrPanel = isLoginMode && authQrPanelOpen;
    const showAuthCredentialFields = !showQrPanel;
    const showNameField = isRegisterMode || isAccountMode;

    if (authNameField) {
      authNameField.hidden = !showNameField;
      authNameField.setAttribute('aria-hidden', showNameField ? 'false' : 'true');
      if (showNameField) {
        authNameField.style.removeProperty('display');
      } else {
        authNameField.style.display = 'none';
      }
    }
    if (authNameInput) {
      authNameInput.required = showNameField;
      if (!showNameField) {
        authNameInput.value = '';
      }
    }
    if (authQrOptionField) {
      authQrOptionField.hidden = !isLoginMode;
      authQrOptionField.setAttribute('aria-hidden', isLoginMode ? 'false' : 'true');
      if (isLoginMode) {
        authQrOptionField.style.removeProperty('display');
      } else {
        authQrOptionField.style.display = 'none';
      }
    }
    if (authQrPanel) {
      authQrPanel.hidden = !showQrPanel;
      authQrPanel.setAttribute('aria-hidden', showQrPanel ? 'false' : 'true');
    }
    if (authEmailField) {
      authEmailField.hidden = !showAuthCredentialFields;
      authEmailField.setAttribute('aria-hidden', showAuthCredentialFields ? 'false' : 'true');
      if (showAuthCredentialFields) {
        authEmailField.style.removeProperty('display');
      } else {
        authEmailField.style.display = 'none';
      }
    }
    if (authPasswordField) {
      authPasswordField.hidden = !showAuthCredentialFields;
      authPasswordField.setAttribute('aria-hidden', showAuthCredentialFields ? 'false' : 'true');
      if (showAuthCredentialFields) {
        authPasswordField.style.removeProperty('display');
      } else {
        authPasswordField.style.display = 'none';
      }
    }
    if (authEmailInput) {
      authEmailInput.required = showAuthCredentialFields;
    }
    if (authPasswordInput) {
      authPasswordInput.required = showAuthCredentialFields;
      authPasswordInput.setAttribute(
        'autocomplete',
        isRegisterMode || isAccountMode ? 'new-password' : 'current-password'
      );
      if (isRegisterMode) {
        authPasswordInput.placeholder = 'Minimo de 6 caracteres';
      } else if (isAccountMode) {
        authPasswordInput.placeholder = 'Minimo de 6 caracteres';
      } else {
        authPasswordInput.placeholder = '';
      }
    }
    if (authSubmitBtn) {
      authSubmitBtn.hidden = showQrPanel;
      authSubmitBtn.setAttribute('aria-hidden', showQrPanel ? 'true' : 'false');
      if (showQrPanel) {
        authSubmitBtn.style.display = 'none';
      } else {
        authSubmitBtn.style.removeProperty('display');
      }
    }
    if (authDeleteBtn) {
      authDeleteBtn.hidden = !isAccountMode;
      authDeleteBtn.setAttribute('aria-hidden', isAccountMode ? 'false' : 'true');
      if (isAccountMode) {
        authDeleteBtn.style.removeProperty('display');
      } else {
        authDeleteBtn.style.display = 'none';
      }
    }
    if (authForm) {
      authForm.classList.toggle('is-account-mode', isAccountMode);
    }
    const actions = authForm ? authForm.querySelector('.auth-form-actions') : null;
    if (actions instanceof HTMLElement) {
      actions.classList.toggle('is-account-mode', isAccountMode);
    }
    setAuthRegisterCtaState(
      (isLoginMode || isRegisterMode) && !showQrPanel,
      {
        name: String(authNameInput?.value || '').trim(),
        email: String(authEmailInput?.value || '').trim().toLowerCase(),
        password: String(authPasswordInput?.value || ''),
      }
    );
  };

  const renderAuthMenu = () => {
    const loggedIn = isAuthLoggedIn();
    const safeUser = normalizeAuthUser(authUser);

    if (authMenuTrigger) {
      const baseLabel = loggedIn
        ? `Conta de ${safeUser?.email || 'usuario'}`
        : 'Abrir menu de autenticacao';
      authMenuTrigger.setAttribute('aria-label', baseLabel);
      authMenuTrigger.setAttribute('title', loggedIn ? (safeUser?.email || 'Conta') : 'Conta');
    }

    authActionButtons.forEach((button) => {
      const action = String(button.dataset.authAction || '').trim();
      const visibleWhenLoggedOut = action === 'login' || action === 'register';
      const visibleWhenLoggedIn = action === 'account' || action === 'sessions' || action === 'logout';
      button.hidden = loggedIn ? !visibleWhenLoggedIn : !visibleWhenLoggedOut;
    });
    syncHeroShareSongsButtonState();
    syncSongShareImportButtonState();
  };

  const setAuthSubmitState = (pending) => {
    authRequestPending = Boolean(pending);
    const normalizedMode = normalizeAuthMode(authMode);

    if (authSubmitBtn) {
      if (authRequestPending) {
        authSubmitBtn.textContent = 'Aguarde...';
      } else {
        authSubmitBtn.textContent = (
          normalizedMode === 'register'
            ? 'Criar conta'
            : (normalizedMode === 'account' ? 'Alterar' : 'Entrar')
        );
      }
      authSubmitBtn.disabled = authRequestPending;
    }

    if (authDeleteBtn) authDeleteBtn.disabled = authRequestPending;
    if (authEmailInput) authEmailInput.disabled = authRequestPending;
    if (authPasswordInput) authPasswordInput.disabled = authRequestPending;
    if (authPasswordToggle) authPasswordToggle.disabled = authRequestPending;
    if (authNameInput) authNameInput.disabled = authRequestPending || normalizeAuthMode(authMode) === 'login';
    if (authRegisterCtaBtn) authRegisterCtaBtn.disabled = authRequestPending;
    setAuthQrRequestState(authQrRequestPending);
  };

  const closeAuthModal = (options = {}) => {
    if (!authModal) return;
    const { restoreFocus = true } = options;
    authQrPanelOpen = false;
    resetAuthQrSessionState();
    syncAuthFormMode(authMode);
    authModal.classList.remove('open');
    authModal.setAttribute('aria-hidden', 'true');
    setAuthFormFeedback('');
    setAuthRegisterCtaState(false);
    setAuthSubmitState(false);
    syncBodyModalLock();
    if (restoreFocus && lastFocusedAuthTrigger) {
      focusWithoutScrollingPage(lastFocusedAuthTrigger);
    }
  };

  const openAuthModal = (mode = 'login', trigger = null, options = {}) => {
    if (!authModal) return;
    if (authSessionsModal && authSessionsModal.classList.contains('open')) {
      closeAuthSessionsModal({ restoreFocus: false });
    }
    const safeOptions = asObject(options);
    const prefill = normalizeAuthPrefill(safeOptions.prefill);
    const finalMode = normalizeAuthMode(mode);
    const safeUser = normalizeAuthUser(authUser);
    if (finalMode === 'account' && !safeUser) {
      openAuthModal('login', trigger);
      return;
    }

    authMode = finalMode;
    authQrPanelOpen = false;
    resetAuthQrSessionState();
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedAuthTrigger = trigger || activeElement || authMenuTrigger || null;

    const showRegister = finalMode === 'register';
    const showAccount = finalMode === 'account';
    syncAuthFormMode(finalMode);

    if (authModalTitle) {
      authModalTitle.textContent = showRegister ? 'Registro' : (showAccount ? 'Conta' : 'Login');
    }

    if (authSubmitBtn) {
      authSubmitBtn.textContent = showRegister ? 'Criar conta' : (showAccount ? 'Alterar' : 'Entrar');
    }

    if (authForm) {
      authForm.reset();
    }
    setAuthPasswordVisibility(false);
    if (showAccount) {
      if (authNameInput) {
        authNameInput.value = safeUser?.name || '';
      }
      if (authEmailInput) {
        authEmailInput.value = safeUser?.email || '';
      }
      if (authPasswordInput) {
        authPasswordInput.value = '';
      }
    } else if (showRegister) {
      if (authNameInput && prefill.name) {
        authNameInput.value = prefill.name;
      }
      if (authEmailInput && prefill.email) {
        authEmailInput.value = prefill.email;
      }
      if (authPasswordInput && prefill.password) {
        authPasswordInput.value = prefill.password;
      }
    } else {
      if (authEmailInput) {
        if (isAuthLoggedIn()) {
          authEmailInput.value = safeUser?.email || '';
        } else if (prefill.email) {
          authEmailInput.value = prefill.email;
        }
      }
      if (authPasswordInput && !isAuthLoggedIn() && prefill.password) {
        authPasswordInput.value = prefill.password;
      }
    }

    setAuthFormFeedback('');
    setAuthSubmitState(false);
    authModal.classList.add('open');
    authModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();

    window.requestAnimationFrame(() => {
      const targetField = (showRegister || showAccount) ? authNameInput : authEmailInput;
      if (targetField instanceof HTMLElement) {
        focusWithoutScrollingPage(targetField);
      }
    });
  };

  const applyAuthPayload = (payload) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const nextToken = String(safePayload.token || '').trim();
    const nextUser = normalizeAuthUser(safePayload.user);
    if (!nextToken || !nextUser) {
      throw new Error('Resposta de autenticacao invalida.');
    }
    authToken = nextToken;
    authUser = nextUser;
    persistAuthState();
    renderAuthMenu();
    refreshUserScopedSongData(0);
    scheduleAuthSessionHealthcheck(1500);
    runDeferredTask(() => {
      void maybeHandlePendingSongShareImport(authMenuTrigger);
    }, 120);
  };

  const restoreAuthState = () => {
    try {
      const storedToken = String(window.localStorage.getItem(AUTH_TOKEN_KEY) || '').trim();
      const rawUser = window.localStorage.getItem(AUTH_USER_KEY);
      let parsedUser = null;
      if (rawUser) {
        parsedUser = JSON.parse(rawUser);
      }
      authToken = storedToken;
      authUser = normalizeAuthUser(parsedUser);
      if (!authToken || !authUser) {
        clearAuthState();
      }
    } catch (err) {
      clearAuthState();
    }
    renderAuthMenu();
    if (isAuthLoggedIn()) {
      scheduleAuthSessionHealthcheck(2200);
    }
  };

  const syncAuthSession = async () => {
    if (!authToken) return;
    try {
      const payload = await requestAuthJson('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const normalizedUser = normalizeAuthUser(payload.user);
      if (!normalizedUser) {
        throw new Error('Sessão invalida.');
      }
      authUser = normalizedUser;
      persistAuthState();
      renderAuthMenu();
      scheduleAuthSessionHealthcheck(2200);
    } catch (err) {
      handleUserScopedApiUnauthorized({
        notify: false,
        openLoginModal: false,
      });
    }
  };

  const handleAuthLogout = async (options = {}) => {
    const safeOptions = asObject(options);
    const shouldCallServer = safeOptions.callServer !== false;
    const toastMessage = String(safeOptions.toastMessage || '').trim() || 'Sessão encerrada.';
    const toastType = String(safeOptions.toastType || '').trim() || 'is-success';
    const previousToken = String(authToken || '').trim();
    clearAuthState();
    clearUserScopedSongData();
    renderAuthMenu();
    closeAuthModal({ restoreFocus: false });
    closeAuthSessionsModal({ restoreFocus: false });
    closeSongShareModal({ restoreFocus: false });
    closeSongShareMergeModal({ action: SONG_SHARE_MERGE_ACTION_DISMISS, excludeConflictKeys: [] });
    closeAuthDropdown();
    closeMainMenu();

    if (shouldCallServer && previousToken) {
      try {
        await requestAuthJson('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${previousToken}`,
          },
        });
      } catch (err) {
        // Keep local logout even if server call fails.
      }
    }

    showSongToast(toastMessage, toastType);
  };

  const handleAuthAccountDelete = async (triggerButton = null) => {
    if (!isAuthLoggedIn()) {
      openAuthModal('login', triggerButton);
      return;
    }

    const shouldDelete = await openFavoriteConfirmModal({
      triggerElement: triggerButton,
      title: 'Excluir conta',
      message: 'Tem certeza que deseja deletar sua conta? Esta acao nao pode ser desfeita.',
      acceptLabel: 'Deletar',
      requirePassword: false,
    });
    if (!shouldDelete) return;

    setAuthFormFeedback('');
    setAuthSubmitState(true);
    try {
      await requestAuthJson('/api/auth/me', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      clearAuthState();
      clearUserScopedSongData();
      renderAuthMenu();
      closeAuthModal({ restoreFocus: false });
      closeAuthSessionsModal({ restoreFocus: false });
      showSongToast('Conta removida com sucesso.', 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao remover conta.';
      setAuthFormFeedback(message);
    } finally {
      setAuthSubmitState(false);
    }
  };

  const handleAuthMenuAction = async (action, triggerButton = null) => {
    const safeAction = String(action || '').trim();
    if (!safeAction) return;

    if (safeAction === 'login') {
      openAuthModal('login', triggerButton);
      return;
    }
    if (safeAction === 'register') {
      openAuthModal('register', triggerButton);
      return;
    }
    if (safeAction === 'account') {
      const safeUser = normalizeAuthUser(authUser);
      if (!safeUser) {
        openAuthModal('login', triggerButton);
        return;
      }
      openAuthModal('account', triggerButton);
      return;
    }
    if (safeAction === 'sessions') {
      openAuthSessionsModal(triggerButton);
      return;
    }
    if (safeAction === 'share') {
      openSongShareModal(triggerButton);
      return;
    }
    if (safeAction === 'logout') {
      await handleAuthLogout();
    }
  };

  setSongShareRequestState(false);
  pendingAuthQrApproval = readAuthQrApprovalFromUrl();
  pendingSongShareImport = readSongShareIdFromUrl();
  restoreAuthState();
  const hasPendingQrApproval = Boolean(pendingAuthQrApproval);
  const hasPendingSongShareImport = Boolean(normalizeSongShareId(pendingSongShareImport));
  const autoOpenPendingSongShareView = Boolean(
    !isAuthLoggedIn()
    && hasPendingSongShareImport
    && shouldAutoOpenSongShareView(pendingSongShareImport)
  );
  if (!isAuthLoggedIn() && hasPendingQrApproval) {
    if (hasPendingSongShareImport) {
      showSongToast('Faça login para autorizar o QR Code. Depois voce pode importar ou ver as musicas compartilhadas.', 'is-warning');
    } else {
      showSongToast('Faça login no celular para autorizar o QR Code.', 'is-warning');
    }
    runDeferredTask(() => {
      openAuthModal('login', authMenuTrigger);
    }, 80);
  } else if (!isAuthLoggedIn() && hasPendingSongShareImport && !autoOpenPendingSongShareView) {
    showSongToast('Link de compartilhamento detectado. Escolha Ver para usar sem conta ou Importar para salvar na sua conta.', 'is-warning');
  }
  runDeferredTask(async () => {
    await syncAuthSession();
    await maybeHandlePendingAuthQrApproval(authMenuTrigger);
    await maybeHandlePendingSongShareImport(authMenuTrigger);
  }, 180);

  if (authActionButtons.length) {
    authActionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const action = String(button.dataset.authAction || '').trim();
        void handleAuthMenuAction(action, button);
      });
    });
  }

  if (authModalCloseButtons.length) {
    authModalCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeAuthModal();
      });
    });
  }

  if (authSessionsCloseButtons.length) {
    authSessionsCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeAuthSessionsModal();
      });
    });
  }

  if (songShareCloseButtons.length) {
    songShareCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeSongShareModal();
      });
    });
  }

  if (songShareMergeCloseButtons.length) {
    songShareMergeCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeSongShareMergeModal({
          action: SONG_SHARE_MERGE_ACTION_CANCEL,
          excludeConflictKeys: [],
        });
      });
    });
  }

  if (songShareMergeImportBtn) {
    songShareMergeImportBtn.addEventListener('click', () => {
      if (!songShareMergeConflictsList) {
        closeSongShareMergeModal({
          action: SONG_SHARE_MERGE_ACTION_ACCEPT,
          excludeConflictKeys: [],
        });
        return;
      }

      const excludeConflictKeys = Array.from(
        songShareMergeConflictsList.querySelectorAll('input[type="checkbox"][data-conflict-key]')
      )
        .filter((node) => node instanceof HTMLInputElement && !node.checked)
        .map((node) => String(node.dataset.conflictKey || '').trim())
        .filter(Boolean);
      closeSongShareMergeModal({
        action: SONG_SHARE_MERGE_ACTION_ACCEPT,
        excludeConflictKeys,
      });
    });
  }

  if (songShareCreateBtn) {
    songShareCreateBtn.addEventListener('click', () => {
      void createSongShareSnapshot();
    });
  }

  if (songShareCopyBtn) {
    songShareCopyBtn.addEventListener('click', () => {
      void copySongShareLink();
    });
  }

  if (songShareLinkInput) {
    songShareLinkInput.addEventListener('focus', () => {
      songShareLinkInput.select();
      songShareLinkInput.setSelectionRange(0, songShareLinkInput.value.length);
    });
  }

  if (songFavoritesShareBtn) {
    songFavoritesShareBtn.addEventListener('click', () => {
      openSongShareModal(songFavoritesShareBtn);
    });
  }

  if (songShareImportBtn) {
    songShareImportBtn.addEventListener('click', () => {
      const safeShareId = normalizeSongShareId(songShareCurrentViewId || readSongShareIdFromUrl());
      if (!safeShareId) {
        showSongToast('Nenhum compartilhamento ativo para importar.', 'is-warning');
        return;
      }
      pendingSongShareImport = safeShareId;
      pendingSongShareMergeAfterLogin = true;
      if (!isAuthLoggedIn()) {
        openAuthModal('login', songShareImportBtn);
        return;
      }
      void maybeHandlePendingSongShareImport(songShareImportBtn);
    });
  }

  if (heroShareSongsBtn) {
    heroShareSongsBtn.addEventListener('click', () => {
      openSongShareModal(heroShareSongsBtn);
    });
  }

  if (authSessionsList) {
    authSessionsList.addEventListener('click', (event) => {
      const targetButton = event.target instanceof Element
        ? event.target.closest('[data-auth-session-logout]')
        : null;
      if (!(targetButton instanceof HTMLElement)) return;
      const sessionGuid = String(targetButton.dataset.authSessionLogout || '').trim();
      if (!sessionGuid || authSessionsRequestPending) return;
      void handleAuthSessionLogout(sessionGuid, targetButton);
    });
  }

  const buildAuthLoginPrefillFromInputs = () => normalizeAuthPrefill({
    name: String(authNameInput?.value || '').trim(),
    email: String(authEmailInput?.value || '').trim().toLowerCase(),
    password: String(authPasswordInput?.value || ''),
  });

  if (authRegisterCtaBtn) {
    authRegisterCtaBtn.addEventListener('click', () => {
      const safeMode = normalizeAuthMode(authMode);
      const prefill = pendingAuthRegisterPrefill || buildAuthLoginPrefillFromInputs();
      if (safeMode === 'register') {
        openAuthModal('login', authRegisterCtaBtn, { prefill });
        return;
      }
      openAuthModal('register', authRegisterCtaBtn, { prefill });
    });
  }

  if (authPasswordToggle && authPasswordInput) {
    authPasswordToggle.addEventListener('click', () => {
      const isCurrentlyVisible = authPasswordInput.type === 'text';
      setAuthPasswordVisibility(!isCurrentlyVisible);
      focusWithoutScrollingPage(authPasswordInput);
      const cursorPosition = Number(authPasswordInput.value.length);
      try {
        authPasswordInput.setSelectionRange(cursorPosition, cursorPosition);
      } catch (_err) {
        // Ignore if selection cannot be restored.
      }
    });
  }

  if (authDeleteBtn) {
    authDeleteBtn.addEventListener('click', () => {
      void handleAuthAccountDelete(authDeleteBtn);
    });
  }

  if (authQrOpenBtn) {
    authQrOpenBtn.addEventListener('click', () => {
      if (normalizeAuthMode(authMode) !== 'login') return;
      authQrPanelOpen = true;
      syncAuthFormMode(authMode);
      void startAuthQrLogin();
    });
  }

  if (authQrRefreshBtn) {
    authQrRefreshBtn.addEventListener('click', () => {
      if (!authQrPanelOpen || normalizeAuthMode(authMode) !== 'login') return;
      void startAuthQrLogin();
    });
  }

  if (authQrCloseBtn) {
    authQrCloseBtn.addEventListener('click', () => {
      authQrPanelOpen = false;
      resetAuthQrSessionState();
      syncAuthFormMode(authMode);
      if (authEmailInput instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          focusWithoutScrollingPage(authEmailInput);
        });
      }
    });
  }

  if (authForm && authEmailInput && authPasswordInput) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (authRequestPending) return;

      const safeMode = normalizeAuthMode(authMode);
      if (safeMode === 'login' && authQrPanelOpen) return;
      const safeName = String(authNameInput?.value || '').trim();
      const safeEmail = String(authEmailInput.value || '').trim().toLowerCase();
      const safePassword = String(authPasswordInput.value || '');

      if ((safeMode === 'register' || safeMode === 'account') && !safeName) {
        setAuthFormFeedback('Informe o nome.');
        if (authNameInput instanceof HTMLElement) {
          focusWithoutScrollingPage(authNameInput);
        }
        return;
      }
      if (!safeEmail) {
        setAuthFormFeedback('Informe o email.');
        focusWithoutScrollingPage(authEmailInput);
        return;
      }
      if (!safePassword) {
        setAuthFormFeedback('Informe a senha.');
        focusWithoutScrollingPage(authPasswordInput);
        return;
      }
      if (safePassword.length < AUTH_PASSWORD_MIN_LENGTH) {
        setAuthFormFeedback(`Senha deve ter ao menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`);
        focusWithoutScrollingPage(authPasswordInput);
        return;
      }
      if (safePassword.length > AUTH_PASSWORD_MAX_LENGTH) {
        setAuthFormFeedback(`Senha deve ter no maximo ${AUTH_PASSWORD_MAX_LENGTH} caracteres.`);
        focusWithoutScrollingPage(authPasswordInput);
        return;
      }
      if (safeMode === 'account' && !isAuthLoggedIn()) {
        setAuthFormFeedback('Sessão expirada. Faça login novamente.');
        openAuthModal('login');
        return;
      }
      if (safeMode === 'account') {
        const shouldUpdate = await openFavoriteConfirmModal({
          triggerElement: authSubmitBtn,
          title: 'Confirmar alteracao',
          message: 'Deseja salvar as alteracoes da conta?',
          acceptLabel: 'Alterar',
          requirePassword: false,
        });
        if (!shouldUpdate) {
          return;
        }
      }

      setAuthFormFeedback('');
      setAuthSubmitState(true);
      try {
        const endpoint = (
          safeMode === 'register'
            ? '/api/auth/register'
            : (safeMode === 'account' ? '/api/auth/me' : '/api/auth/login')
        );
        const method = safeMode === 'account' ? 'PUT' : 'POST';
        const headers = {
          'Content-Type': 'application/json',
        };
        if (safeMode === 'account') {
          headers.Authorization = `Bearer ${authToken}`;
        }
        const payload = await requestAuthJson(endpoint, {
          method,
          headers,
          body: JSON.stringify(
            safeMode === 'register'
              ? { name: safeName, email: safeEmail, password: safePassword }
              : (
                safeMode === 'account'
                  ? { name: safeName, email: safeEmail, password: safePassword }
                  : { email: safeEmail, password: safePassword }
              )
          ),
        });

        if (safeMode === 'account') {
          const normalizedUser = normalizeAuthUser(payload.user);
          if (!normalizedUser) {
            throw new Error('Resposta de conta invalida.');
          }
          authUser = normalizedUser;
          persistAuthState();
          renderAuthMenu();
          refreshUserScopedSongData(0);
        } else {
          applyAuthPayload(payload);
        }

        closeAuthModal({ restoreFocus: false });
        showSongToast(
          safeMode === 'register'
            ? 'Conta criada com sucesso.'
            : (safeMode === 'account' ? 'Conta atualizada com sucesso.' : 'Login realizado com sucesso.'),
          'is-success'
        );
        if (safeMode !== 'account') {
          runDeferredTask(() => {
            void maybeHandlePendingAuthQrApproval(authSubmitBtn);
          }, 80);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao autenticar.';
        setAuthFormFeedback(message);
        if (safeMode === 'login') {
          setAuthRegisterCtaState(true, {
            name: safeName,
            email: safeEmail,
            password: safePassword,
          });
        } else {
          setAuthRegisterCtaState(false);
        }
      } finally {
        setAuthSubmitState(false);
      }
    });
  }

  const hideSongSearchResultsExcept = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    songSearchWidgets.forEach((widget) => {
      if (targetWidget && widget === targetWidget) return;
      widget.resultsContainer.hidden = true;
      updateSongSearchLoadMoreButton(widget, {
        visible: false,
        hasMore: false,
        loading: false
      });
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

  const resolveCurrentSongSelectedKeyForSave = () => {
    if (!songState.originalRoot) return '';
    const preferFlat = songState.originalRoot.includes('b');
    const currentRoot = transposeRoot(songState.originalRoot, songState.semitones, preferFlat);
    return `${currentRoot}${songState.originalSuffix || ''}`.trim();
  };

  const maybeConfirmManualSongKeyUpdateBeforeClose = async (triggerElement = null) => {
    const customSongId = String(songState.customSongId || '').trim();
    const shouldCheckUpdate = Boolean(
      songState.loaded
      && songState.source === 'manual'
      && songState.contentType === 'chords'
      && songState.originalRoot
      && songState.semitones !== 0
      && customSongId
      && !songState.customSongIsDraft
    );
    if (!shouldCheckUpdate) return true;

    const selectedKey = resolveCurrentSongSelectedKeyForSave();
    const savedKey = String(songState.originalKey || '').trim();
    if (!selectedKey || selectedKey === savedKey) return true;

    const targetSong = getCustomSongById(customSongId);
    if (!targetSong || targetSong.isDraft) return true;
    const safeTitle = (targetSong.title || songState.title || readSongMessage('defaultSongTitle')).trim();

    const shouldUpdate = await openFavoriteConfirmModal({
      triggerElement,
      songTitle: safeTitle,
      title: readSongMessage('customSongToneConfirmTitle'),
      message: readSongMessage('customSongToneConfirmMessage',
        { title: safeTitle, key: selectedKey }
      ),
      cancelLabel: readSongMessage('customSongToneConfirmCancel'),
      acceptLabel: readSongMessage('customSongToneConfirmAccept'),
    });
    if (!shouldUpdate) return true;

    try {
      const updatedSong = await updateCustomSongOnServer(customSongId, {
        title: targetSong.title || safeTitle,
        key: selectedKey,
        lyrics_text: String(targetSong.lyricsText || ''),
        chords_text: String(targetSong.chordsText || ''),
      });
      const normalizedUpdated = { ...normalizeCustomSong(updatedSong), isDraft: false };
      let replaced = false;
      customSongs = customSongs.map((item) => {
        if (item.id !== customSongId) return item;
        replaced = true;
        return normalizedUpdated;
      });
      if (!replaced) {
        customSongs.unshift(normalizedUpdated);
      }
      renderCustomSongs();

      songState.originalKey = selectedKey;
      const nextKeyParts = splitKey(selectedKey);
      songState.originalRoot = nextKeyParts ? nextKeyParts.root : songState.originalRoot;
      songState.originalSuffix = nextKeyParts ? nextKeyParts.suffix : songState.originalSuffix;
      songState.semitones = 0;
      renderFetchedSong();

      setSongFeedback(readSongMessage('customSongToneUpdateSuccess'), 'is-success');
      return true;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongToneUpdateError');
      showSongToast(message, 'is-error');
      return false;
    }
  };

  const closeSongModal = async (options = {}) => {
    if (!songModal || songModalCloseInProgress) return;
    const { force = false, triggerElement = null } = options;
    songModalCloseInProgress = true;

    try {
      if (!force) {
        const canClose = await maybeConfirmManualSongKeyUpdateBeforeClose(triggerElement);
        if (!canClose) return;
      }
      flushFavoriteTonePreferencePersist();

      const focusTarget = lastFocusedSongTrigger instanceof HTMLElement ? lastFocusedSongTrigger : null;
      songModal.classList.remove('open');
      songModal.setAttribute('aria-hidden', 'true');
      syncBodyModalLock();
      if (!hasAnyOpenModal() && focusTarget) {
        window.requestAnimationFrame(() => {
          focusWithoutScrollingPage(focusTarget);
        });
      }
      lastFocusedSongTrigger = null;
    } finally {
      songModalCloseInProgress = false;
    }
  };

  const consumeFavoriteConfirmPassword = () => {
    const password = String(favoriteConfirmCapturedPassword || '');
    favoriteConfirmCapturedPassword = '';
    return password;
  };

  const resetFavoriteConfirmPasswordUi = (options = {}) => {
    const safeOptions = asObject(options);
    const preserveCapturedPassword = Boolean(safeOptions.preserveCapturedPassword);
    favoriteConfirmRequirePassword = false;
    if (!preserveCapturedPassword) {
      favoriteConfirmCapturedPassword = '';
    }
    if (favoriteConfirmPasswordWrap) {
      favoriteConfirmPasswordWrap.hidden = true;
    }
    if (favoriteConfirmPasswordInput) {
      favoriteConfirmPasswordInput.value = '';
      favoriteConfirmPasswordInput.removeAttribute('aria-invalid');
    }
    if (favoriteConfirmPasswordError) {
      favoriteConfirmPasswordError.hidden = true;
      favoriteConfirmPasswordError.textContent = readMysteryMessage('assignCategoryDeactivatePasswordRequired');
    }
  };

  const showFavoriteConfirmPasswordError = (message = '') => {
    if (!favoriteConfirmPasswordError || !favoriteConfirmPasswordInput) return;
    const resolvedMessage = String(message || '').trim()
      || readMysteryMessage('assignCategoryDeactivatePasswordRequired');
    favoriteConfirmPasswordError.textContent = resolvedMessage;
    favoriteConfirmPasswordError.hidden = false;
    favoriteConfirmPasswordInput.setAttribute('aria-invalid', 'true');
    window.requestAnimationFrame(() => {
      focusWithoutScrollingPage(favoriteConfirmPasswordInput);
    });
  };

  const prepareFavoriteConfirmPasswordUi = (options = {}) => {
    const safeOptions = asObject(options);
    const requirePassword = Boolean(safeOptions.requirePassword);
    favoriteConfirmRequirePassword = requirePassword;
    favoriteConfirmCapturedPassword = '';
    if (!favoriteConfirmPasswordWrap || !favoriteConfirmPasswordInput) return;

    favoriteConfirmPasswordWrap.hidden = !requirePassword;
    favoriteConfirmPasswordInput.value = '';
    favoriteConfirmPasswordInput.removeAttribute('aria-invalid');
    favoriteConfirmPasswordInput.placeholder = String(
      safeOptions.passwordPlaceholder
      || readMysteryMessage('assignCategoryDeactivatePasswordPlaceholder')
    ).trim();
    const passwordLabel = String(
      safeOptions.passwordLabel
      || readMysteryMessage('assignCategoryDeactivatePasswordLabel')
    ).trim();
    favoriteConfirmPasswordInput.setAttribute('aria-label', passwordLabel);
    if (favoriteConfirmPasswordLabel) {
      favoriteConfirmPasswordLabel.textContent = passwordLabel;
    }
    if (favoriteConfirmPasswordError) {
      favoriteConfirmPasswordError.hidden = true;
      favoriteConfirmPasswordError.textContent = readMysteryMessage('assignCategoryDeactivatePasswordRequired');
    }
  };

  const handleFavoriteConfirmAcceptAction = () => {
    if (!favoriteConfirmRequirePassword) {
      closeFavoriteConfirmModal(FAVORITE_CONFIRM_ACTION_ACCEPT);
      return;
    }
    const typedPassword = String(favoriteConfirmPasswordInput?.value || '');
    if (!typedPassword.trim()) {
      showFavoriteConfirmPasswordError(
        readMysteryMessage('assignCategoryDeactivatePasswordRequired')
      );
      return;
    }
    favoriteConfirmCapturedPassword = typedPassword;
    closeFavoriteConfirmModal(FAVORITE_CONFIRM_ACTION_ACCEPT);
  };

  const resolvePendingFavoriteConfirm = (action = FAVORITE_CONFIRM_ACTION_DISMISS) => {
    if (!pendingFavoriteConfirmResolver) return;
    const resolve = pendingFavoriteConfirmResolver;
    const mode = pendingFavoriteConfirmMode;
    pendingFavoriteConfirmResolver = null;
    pendingFavoriteConfirmMode = 'boolean';
    if (mode === 'action') {
      resolve(action);
      return;
    }
    resolve(action === FAVORITE_CONFIRM_ACTION_ACCEPT);
  };

  const closeFavoriteConfirmModal = (action = FAVORITE_CONFIRM_ACTION_DISMISS) => {
    if (!favoriteConfirmModal) {
      resetFavoriteConfirmPasswordUi({
        preserveCapturedPassword: action === FAVORITE_CONFIRM_ACTION_ACCEPT && favoriteConfirmRequirePassword,
      });
      resolvePendingFavoriteConfirm(action);
      return;
    }
    const focusTarget = (
      lastFocusedFavoriteConfirmTrigger instanceof HTMLElement
        ? lastFocusedFavoriteConfirmTrigger
        : null
    );
    favoriteConfirmModal.classList.remove('open');
    favoriteConfirmModal.setAttribute('aria-hidden', 'true');
    resetFavoriteConfirmPasswordUi({
      preserveCapturedPassword: action === FAVORITE_CONFIRM_ACTION_ACCEPT && favoriteConfirmRequirePassword,
    });
    syncBodyModalLock();
    resolvePendingFavoriteConfirm(action);
    if (!hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedFavoriteConfirmTrigger = null;
  };

  const openFavoriteConfirmModal = (triggerOrOptions = null, songTitle = '') => {
    const isOptionsObject = (
      triggerOrOptions
      && typeof triggerOrOptions === 'object'
      && !(triggerOrOptions instanceof HTMLElement)
    );
    const options = isOptionsObject ? asObject(triggerOrOptions) : {};
    const triggerElement = (
      isOptionsObject
        ? (options.triggerElement instanceof HTMLElement ? options.triggerElement : null)
        : (triggerOrOptions instanceof HTMLElement ? triggerOrOptions : null)
    );
    const resolvedSongTitle = (
      isOptionsObject
        ? String(options.songTitle || '').trim()
        : String(songTitle || '').trim()
    ) || readSongMessage('defaultSongTitle');
    const title = String(options.title || '').trim()
      || readSongMessage('favoriteRemoveConfirmTitle');
    const cancelLabel = String(options.cancelLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmCancel');
    const acceptLabel = String(options.acceptLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmAccept');
    const message = String(options.message || '').trim()
      || readSongMessage('favoriteRemoveConfirmMessageWithTitle',
        { title: resolvedSongTitle }
      );
    const showCancel = options.showCancel !== false;
    const requirePassword = Boolean(options.requirePassword);
    const passwordLabel = String(
      options.passwordLabel
      || readMysteryMessage('assignCategoryDeactivatePasswordLabel')
    ).trim();
    const passwordPlaceholder = String(
      options.passwordPlaceholder
      || readMysteryMessage('assignCategoryDeactivatePasswordPlaceholder')
    ).trim();

    if (!favoriteConfirmModal || !favoriteConfirmMessage || !favoriteConfirmAcceptBtn) {
      if (!window.confirm(message)) {
        favoriteConfirmCapturedPassword = '';
        return Promise.resolve(false);
      }
      if (requirePassword) {
        const typedPassword = window.prompt(passwordLabel, '');
        const safePassword = String(typedPassword || '');
        if (typedPassword === null || !safePassword.trim()) {
          favoriteConfirmCapturedPassword = '';
          return Promise.resolve(false);
        }
        favoriteConfirmCapturedPassword = safePassword;
      } else {
        favoriteConfirmCapturedPassword = '';
      }
      return Promise.resolve(true);
    }

    prepareFavoriteConfirmPasswordUi({
      requirePassword,
      passwordLabel,
      passwordPlaceholder,
    });
    if (favoriteConfirmTitle) {
      favoriteConfirmTitle.textContent = title;
    }
    if (favoriteConfirmCancelBtn) {
      favoriteConfirmCancelBtn.textContent = cancelLabel;
      favoriteConfirmCancelBtn.hidden = !showCancel;
      favoriteConfirmCancelBtn.setAttribute('aria-hidden', showCancel ? 'false' : 'true');
      if (showCancel) {
        favoriteConfirmCancelBtn.style.removeProperty('display');
      } else {
        favoriteConfirmCancelBtn.style.display = 'none';
      }
    }
    favoriteConfirmAcceptBtn.textContent = acceptLabel;
    favoriteConfirmMessage.textContent = message;

    if (pendingFavoriteConfirmResolver) {
      resolvePendingFavoriteConfirm(FAVORITE_CONFIRM_ACTION_DISMISS);
    }

    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedFavoriteConfirmTrigger = triggerElement || fallbackFocus;
    favoriteConfirmModal.classList.add('open');
    favoriteConfirmModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    window.requestAnimationFrame(() => {
      if (favoriteConfirmRequirePassword && favoriteConfirmPasswordInput) {
        focusWithoutScrollingPage(favoriteConfirmPasswordInput);
        return;
      }
      focusWithoutScrollingPage(favoriteConfirmAcceptBtn);
    });

    return new Promise((resolve) => {
      pendingFavoriteConfirmMode = 'boolean';
      pendingFavoriteConfirmResolver = resolve;
    });
  };

  const openFavoriteDecisionModal = (options = {}) => {
    const safeOptions = asObject(options);
    const triggerElement = safeOptions.triggerElement instanceof HTMLElement
      ? safeOptions.triggerElement
      : null;
    const title = String(safeOptions.title || '').trim()
      || readSongMessage('favoriteRemoveConfirmTitle');
    const cancelLabel = String(safeOptions.cancelLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmCancel');
    const acceptLabel = String(safeOptions.acceptLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmAccept');
    const message = String(safeOptions.message || '').trim()
      || readSongMessage('favoriteRemoveConfirmMessage');
    const fallbackCancelConfirmMessage = String(safeOptions.fallbackCancelConfirmMessage || '').trim()
      || readSongMessage('favoriteRemoveConfirmMessage');

    if (!favoriteConfirmModal || !favoriteConfirmMessage || !favoriteConfirmAcceptBtn) {
      const shouldAccept = window.confirm(message);
      if (shouldAccept) return Promise.resolve(FAVORITE_CONFIRM_ACTION_ACCEPT);
      const shouldCancelAction = window.confirm(fallbackCancelConfirmMessage);
      return Promise.resolve(shouldCancelAction ? FAVORITE_CONFIRM_ACTION_CANCEL : FAVORITE_CONFIRM_ACTION_DISMISS);
    }

    prepareFavoriteConfirmPasswordUi({ requirePassword: false });
    if (favoriteConfirmTitle) {
      favoriteConfirmTitle.textContent = title;
    }
    if (favoriteConfirmCancelBtn) {
      favoriteConfirmCancelBtn.textContent = cancelLabel;
      favoriteConfirmCancelBtn.hidden = false;
      favoriteConfirmCancelBtn.setAttribute('aria-hidden', 'false');
      favoriteConfirmCancelBtn.style.removeProperty('display');
    }
    favoriteConfirmAcceptBtn.textContent = acceptLabel;
    favoriteConfirmMessage.textContent = message;

    if (pendingFavoriteConfirmResolver) {
      resolvePendingFavoriteConfirm(FAVORITE_CONFIRM_ACTION_DISMISS);
    }

    const fallbackFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastFocusedFavoriteConfirmTrigger = triggerElement || fallbackFocus;
    favoriteConfirmModal.classList.add('open');
    favoriteConfirmModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    window.requestAnimationFrame(() => {
      focusWithoutScrollingPage(favoriteConfirmAcceptBtn);
    });

    return new Promise((resolve) => {
      pendingFavoriteConfirmMode = 'action';
      pendingFavoriteConfirmResolver = resolve;
    });
  };

  if (songModalCloseButtons.length) {
    songModalCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeSongModal({ triggerElement: button });
      });
    });
  }

  if (favoriteConfirmCloseButtons.length) {
    favoriteConfirmCloseButtons.forEach((button) => {
      const isCancelButton = button === favoriteConfirmCancelBtn;
      button.addEventListener('click', () => {
        closeFavoriteConfirmModal(
          isCancelButton ? FAVORITE_CONFIRM_ACTION_CANCEL : FAVORITE_CONFIRM_ACTION_DISMISS
        );
      });
    });
  }
  if (favoriteConfirmAcceptBtn) {
    favoriteConfirmAcceptBtn.addEventListener('click', handleFavoriteConfirmAcceptAction);
  }
  if (favoriteConfirmPasswordInput) {
    favoriteConfirmPasswordInput.addEventListener('input', () => {
      if (favoriteConfirmPasswordError) {
        favoriteConfirmPasswordError.hidden = true;
      }
      favoriteConfirmPasswordInput.removeAttribute('aria-invalid');
    });
    favoriteConfirmPasswordInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleFavoriteConfirmAcceptAction();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeFavoriteConfirmModal(FAVORITE_CONFIRM_ACTION_CANCEL);
      }
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
    if (!songState.originalRoot) return readSongMessage('notInformed');
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
      songModalToneLabel.textContent = readSongMessage('toneLabel');
    }
  };

  const renderFetchedSong = () => {
    if (!songState.loaded) return;

    const displayTitle = songState.artist
      ? `${songState.title || readSongMessage('defaultSongTitle')} - ${songState.artist}`
      : (songState.title || readSongMessage('loadedSongTitle'));

    if (fetchedSongTitle) {
      fetchedSongTitle.textContent = displayTitle;
    }

    if (fetchedSongMeta) {
      const sourceLabel = songState.sourceLabel || readSongMessage('sourceDefault');
      const sourcePrefix = readSongMessage('sourcePrefix');
      if (songState.contentType === 'lyrics') {
        fetchedSongMeta.textContent = `${sourcePrefix} ${sourceLabel}`;
      } else {
        const original = songState.originalKey || readSongMessage('notInformed');
        const originalPrefix = readSongMessage('originalKeyPrefix');
        fetchedSongMeta.textContent = `${originalPrefix} ${original} | ${sourcePrefix} ${sourceLabel}`;
      }
    }

    if (songModalExternalActions && songModalSpotifyLink && songModalYoutubeLink) {
      const showExternalActions = songState.contentType === 'lyrics';
      const externalQuery = [songState.title || '', songState.artist || ''].filter(Boolean).join(' ').trim();
      const encodedExternalQuery = externalQuery ? encodeURIComponent(externalQuery) : '';
      const spotifyUrl = encodedExternalQuery
        ? `https://open.spotify.com/search/${encodedExternalQuery}`
        : '';
      const youtubeUrl = encodedExternalQuery
        ? `https://www.youtube.com/results?search_query=${encodedExternalQuery}`
        : '';

      const setupExternalLink = (node, href, title, ariaLabel) => {
        if (!node) return;
        node.title = title;
        node.setAttribute('aria-label', ariaLabel);
        if (href) {
          node.href = href;
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          node.classList.remove('is-disabled');
          node.removeAttribute('aria-disabled');
          return;
        }
        node.removeAttribute('href');
        node.removeAttribute('target');
        node.removeAttribute('rel');
        node.classList.add('is-disabled');
        node.setAttribute('aria-disabled', 'true');
      };

      setupExternalLink(
        songModalSpotifyLink,
        spotifyUrl,
        readSongMessage('spotifyTitle'),
        readSongMessage('spotifyAria')
      );
      setupExternalLink(
        songModalYoutubeLink,
        youtubeUrl,
        readSongMessage('youtubeTitle'),
        readSongMessage('youtubeAria')
      );

      songModalExternalActions.hidden = !showExternalActions;
    }

    const canTranspose = Boolean(songState.contentType === 'chords' && songState.originalRoot);
    const preferFlat = canTranspose && songState.originalRoot ? songState.originalRoot.includes('b') : false;
    const visibleContent = canTranspose
      ? transposeBracketedChords(songState.originalContent, songState.semitones, preferFlat)
      : (songState.originalContent || '');
    if (fetchedSongLyrics) {
      if (songState.contentType === 'chords') {
        fetchedSongLyrics.innerHTML = renderChordTokensHtml(visibleContent);
      } else {
        fetchedSongLyrics.textContent = visibleContent;
      }
      fetchedSongLyrics.scrollTop = 0;
    }

    updateToneButtonsState();
  };

  const setSongActionLoading = (button, loading, fallbackLabel) => {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML || '';
      }
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent || fallbackLabel;
      }
      if (!button.dataset.originalTitle) {
        button.dataset.originalTitle = button.getAttribute('title') || '';
      }
      if (!button.dataset.originalAriaLabel) {
        button.dataset.originalAriaLabel = button.getAttribute('aria-label') || '';
      }
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      const loadingLabel = readSongMessage('loadingAction');
      button.setAttribute('title', loadingLabel);
      button.setAttribute('aria-label', loadingLabel);
      return;
    }

    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    } else {
      button.textContent = button.dataset.originalLabel || fallbackLabel;
    }
    if (button.dataset.originalTitle) {
      button.setAttribute('title', button.dataset.originalTitle);
    } else {
      button.removeAttribute('title');
    }
    if (button.dataset.originalAriaLabel) {
      button.setAttribute('aria-label', button.dataset.originalAriaLabel);
    } else if (fallbackLabel) {
      button.setAttribute('aria-label', fallbackLabel);
    } else {
      button.removeAttribute('aria-label');
    }
    delete button.dataset.originalHtml;
    delete button.dataset.originalLabel;
    delete button.dataset.originalTitle;
    delete button.dataset.originalAriaLabel;
  };

  const detectAndApplySongKeyIfMissing = async (preferredSelectedKey = '') => {
    if (!songState.loaded || songState.contentType !== 'chords' || songState.originalRoot) return false;

    const requestTitle = String(songState.title || '').trim();
    const requestArtist = String(songState.artist || '').trim();
    const requestSourceUrl = String(songState.sourceUrl || '').trim();
    if (!requestTitle && !requestArtist) return false;

    const requestId = songKeyAutoDetectRequestId + 1;
    songKeyAutoDetectRequestId = requestId;
    setSongFeedback(
      readSongMessage('detectingKey'),
      'is-loading'
    );

    try {
      const response = await fetch('/api/songs/detect-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: requestTitle,
          artist: requestArtist
        })
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message
          || payload?.message
          || readSongMessage('detectedKeyError');
        throw new Error(message);
      }

      const detectedKey = String(payload.original_key || '').trim();
      const keyParts = splitKey(detectedKey);
      if (!keyParts || !keyParts.root) {
        throw new Error(readSongMessage('detectedKeyError'));
      }

      const isStale = (
        requestId !== songKeyAutoDetectRequestId
        || !songState.loaded
        || songState.contentType !== 'chords'
        || Boolean(songState.originalRoot)
        || String(songState.title || '').trim() !== requestTitle
        || String(songState.artist || '').trim() !== requestArtist
        || String(songState.sourceUrl || '').trim() !== requestSourceUrl
      );
      if (isStale) return false;

      songState.originalKey = detectedKey;
      songState.originalRoot = keyParts.root;
      songState.originalSuffix = keyParts.suffix || '';
      songState.semitones = 0;
      applySavedSelectedKeyToCurrentSong(songState.sourceUrl, preferredSelectedKey);
      renderFetchedSong();
      setSongFeedback(
        readSongMessage('detectedKeySuccess', { key: detectedKey }),
        'is-success'
      );
      return true;
    } catch (err) {
      const isStale = (
        requestId !== songKeyAutoDetectRequestId
        || !songState.loaded
        || songState.contentType !== 'chords'
        || Boolean(songState.originalRoot)
        || String(songState.title || '').trim() !== requestTitle
        || String(songState.artist || '').trim() !== requestArtist
        || String(songState.sourceUrl || '').trim() !== requestSourceUrl
      );
      if (isStale) return false;

      const fallbackMessage = readSongMessage('detectedKeyError');
      const message = err instanceof Error && err.message
        ? err.message
        : fallbackMessage;
      setSongFeedback(message, 'is-warning');
      return false;
    }
  };

  async function loadSongFromUrl(url, triggerButton = null, selectedResult = null) {
    const safeUrl = (url || '').trim();
    if (!safeUrl) {
      setSongFeedback(readSongMessage('invalidChordLink'), 'is-error');
      return;
    }

    const cachedFavorite = findCachedFavoriteBySongIdentity({
      url: safeUrl,
      title: selectedResult?.title || '',
      artist: selectedResult?.artist || '',
    });
    const hasCachedSongData = Boolean(
      cachedFavorite
      && String(cachedFavorite.chordsText || '').trim()
    );
    if (hasCachedSongData) {
      openSongFavoriteCached(cachedFavorite, 'chords', triggerButton, { allowExternalFallback: false });
      return;
    }

    setSongActionLoading(triggerButton, true, readSongMessage('chordsButton'));
    setSongFeedback(readSongMessage('loadingChord'), 'is-loading');

    try {
      const response = await fetch('/api/songs/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: safeUrl })
      });

      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || readSongMessage('chordFetchErrorApi');
        throw new Error(message);
      }

      const selectedTitle = (selectedResult?.title || '').trim();
      const selectedArtist = (selectedResult?.artist || '').trim();
      const preferredSelectedKey = (
        selectedResult?.chords_selected_key
        || selectedResult?.chordsSelectedKey
        || ''
      );
      const keyParts = splitKey(payload.original_key || '');
      songState.loaded = true;
      songState.title = selectedTitle || payload.title || readSongMessage('defaultSongTitle');
      songState.artist = selectedArtist || payload.artist || '';
      songState.source = payload.source || '';
      songState.sourceLabel = resolveSongSourceLabel(songState.source, payload.source_label || '');
      songState.sourceUrl = payload.url || safeUrl;
      songState.originalKey = payload.original_key || '';
      songState.originalRoot = keyParts ? keyParts.root : null;
      songState.originalSuffix = keyParts ? keyParts.suffix : '';
      songState.semitones = 0;
      songState.originalContent = payload.lyrics || '';
      songState.contentType = 'chords';
      songState.customSongId = '';
      songState.customSongIsDraft = false;
      applySavedSelectedKeyToCurrentSong(songState.sourceUrl, preferredSelectedKey);

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      if (!songState.originalRoot) {
        void detectAndApplySongKeyIfMissing(preferredSelectedKey);
      } else {
        setSongFeedback(readSongMessage('chordLoaded'), 'is-success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : readSongMessage('chordLoadError');
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, readSongMessage('chordsButton'));
    }
  }

  async function loadLyricsFromService(result, triggerButton = null) {
    const title = (result?.title || '').trim();
    const artist = (result?.artist || '').trim();
    const sourceUrl = (result?.url || '').trim();

    if (!title && !sourceUrl) {
      setSongFeedback(readSongMessage('invalidLyricsTarget'), 'is-error');
      return;
    }

    const cachedFavorite = findCachedFavoriteBySongIdentity({
      url: sourceUrl,
      title,
      artist,
    });
    const hasCachedSongData = Boolean(
      cachedFavorite
      && (
        String(cachedFavorite.lyricsText || '').trim()
        || String(cachedFavorite.chordsText || '').trim()
      )
    );
    if (hasCachedSongData) {
      openSongFavoriteCached(cachedFavorite, 'lyrics', triggerButton, { allowExternalFallback: false });
      return;
    }

    setSongActionLoading(triggerButton, true, readSongMessage('lyricsButton'));
    setSongFeedback(readSongMessage('loadingLyrics'), 'is-loading');

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

      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || readSongMessage('lyricsFetchErrorApi');
        const code = payload?.detail?.code || payload?.code || '';
        const error = new Error(message);
        if (code) {
          error.code = code;
        }
        throw error;
      }

      songState.loaded = true;
      songState.title = title || payload.title || readSongMessage('defaultSongTitle');
      songState.artist = artist || payload.artist || '';
      songState.source = payload.source || result?.source || 'cifraclub';
      songState.sourceLabel = resolveSongSourceLabel(songState.source, payload.source_label || '');
      songState.sourceUrl = payload.url || sourceUrl;
      songState.originalKey = '';
      songState.originalRoot = null;
      songState.originalSuffix = '';
      songState.semitones = 0;
      songState.originalContent = payload.lyrics || '';
      songState.contentType = 'lyrics';
      songState.customSongId = '';
      songState.customSongIsDraft = false;

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      setSongFeedback(readSongMessage('lyricsLoaded'), 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : readSongMessage('lyricsLoadError');
      const isLyricsNotFound = (
        err
        && typeof err === 'object'
        && 'code' in err
        && err.code === 'lyrics_not_found'
      ) || message === readSongMessage('lyricsNotFoundApiMessage');

      if (isLyricsNotFound) {
        showSongToast(readSongMessage('lyricsNotFoundToast'), 'is-warning');
      }
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, readSongMessage('lyricsButton'));
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
  const LYRICS_ACTION_ICON = [
    '<svg class="song-search-action-icon song-search-action-icon-lyrics" viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M17 11a5 5 0 0 1-10 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M12 16v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M9 20h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '</svg>'
  ].join('');
  const CHORDS_ACTION_ICON = [
    '<svg class="song-search-action-icon song-search-action-icon-chords" viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M12 3.4 18 7.6V13c0 3.9-2.4 6.5-6 8-3.6-1.5-6-4.1-6-8V7.6L12 3.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '<path d="M10 9h4M10 12h4M10 15h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>',
    '</svg>'
  ].join('');
  const FAVORITE_STAR_OUTLINE_ICON = [
    '<svg class="song-search-action-icon" viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M12 3.4l2.7 5.5 6 .9-4.3 4.2 1 5.9-5.4-2.8-5.4 2.8 1-5.9L3.3 9.8l6-.9L12 3.4z"></path>',
    '</svg>',
  ].join('');
  const FAVORITE_STAR_FILLED_ICON = [
    '<svg class="song-search-action-icon" viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M12 3.4l2.7 5.5 6 .9-4.3 4.2 1 5.9-5.4-2.8-5.4 2.8 1-5.9L3.3 9.8l6-.9L12 3.4z"></path>',
    '</svg>',
  ].join('');

  const setFavoriteButtonState = (button, isSaved, isLoading = false) => {
    if (!(button instanceof HTMLElement)) return;

    button.classList.toggle('is-active', Boolean(isSaved));
    button.disabled = Boolean(isLoading || !(button.dataset.songUrlKey || '').trim());
    button.innerHTML = isSaved ? FAVORITE_STAR_FILLED_ICON : FAVORITE_STAR_OUTLINE_ICON;
    button.title = isSaved
      ? readSongMessage('favoriteButtonRemove')
      : readSongMessage('favoriteButtonAdd');
    button.setAttribute(
      'aria-label',
      isSaved
        ? readSongMessage('favoriteAriaRemove')
        : readSongMessage('favoriteAriaAdd')
    );
  };

  const applyFavoriteStateToRenderedButtons = (urlKey, isSaved) => {
    if (!urlKey) return;
    document
      .querySelectorAll(`.song-search-action-favorite[data-song-url-key="${urlKey}"]`)
      .forEach((button) => setFavoriteButtonState(button, isSaved, false));
  };

  const openSongFavoriteCached = (favorite, mode, triggerButton, options = {}) => {
    const safeFavorite = asObject(favorite);
    const safeOptions = asObject(options);
    const allowExternalFallback = safeOptions.allowExternalFallback !== false;
    const requestedLyricsMode = mode === 'lyrics';
    const resolvedMode = requestedLyricsMode ? 'lyrics' : 'chords';
    let content = String(requestedLyricsMode ? (safeFavorite.lyricsText || '') : (safeFavorite.chordsText || ''));
    let usedLyricsFromChordsFallback = false;

    if (!content.trim()) {
      if (requestedLyricsMode) {
        const derivedLyrics = extractPlainLyricsFromChordsTextLocal(safeFavorite.chordsText || '');
        if (derivedLyrics.trim()) {
          content = derivedLyrics;
          usedLyricsFromChordsFallback = true;
        }
      }
    }

    const isLyricsMode = resolvedMode === 'lyrics';
    if (!content.trim()) {
      if (!allowExternalFallback) {
        setSongFeedback(
          readSongMessage('favoriteCachedContentMissing'),
          'is-warning'
        );
        return;
      }

      if (requestedLyricsMode) {
        loadLyricsFromService({
          title: safeFavorite.title || '',
          artist: safeFavorite.artist || '',
          url: safeFavorite.url || '',
        }, triggerButton);
      } else {
        loadSongFromUrl(safeFavorite.url || '', triggerButton, {
          title: safeFavorite.title || '',
          artist: safeFavorite.artist || '',
          chords_selected_key: safeFavorite.chordsSelectedKey || '',
        });
      }
      return;
    }

    const fallbackLabel = isLyricsMode
      ? readSongMessage('lyricsButton')
      : readSongMessage('chordsButton');
    setSongActionLoading(triggerButton, true, fallbackLabel);
    setSongFeedback(
      isLyricsMode
        ? readSongMessage('loadingLyrics')
        : readSongMessage('loadingChord'),
      'is-loading'
    );

    try {
      songState.loaded = true;
      songState.title = (safeFavorite.title || '').trim() || readSongMessage('defaultSongTitle');
      songState.artist = (safeFavorite.artist || '').trim();
      songState.semitones = 0;
      songState.originalContent = content;

      if (isLyricsMode) {
        songState.source = (safeFavorite.lyricsSource || safeFavorite.chordsSource || safeFavorite.source || '').trim() || 'cifraclub';
        songState.sourceLabel = resolveSongSourceLabel(songState.source, '');
        songState.sourceUrl = (safeFavorite.lyricsSourceUrl || safeFavorite.url || '').trim();
        songState.originalKey = '';
        songState.originalRoot = null;
        songState.originalSuffix = '';
        songState.contentType = 'lyrics';
      } else {
        songState.source = (safeFavorite.chordsSource || safeFavorite.source || '').trim();
        songState.sourceLabel = resolveSongSourceLabel(songState.source, '');
        songState.sourceUrl = (safeFavorite.chordsSourceUrl || safeFavorite.url || '').trim();
        songState.originalKey = (safeFavorite.chordsOriginalKey || '').trim();
        const keyParts = splitKey(songState.originalKey);
        songState.originalRoot = keyParts ? keyParts.root : null;
        songState.originalSuffix = keyParts ? keyParts.suffix : '';
        songState.contentType = 'chords';
        applySavedSelectedKeyToCurrentSong(songState.sourceUrl, safeFavorite.chordsSelectedKey || '');
      }
      songState.customSongId = '';
      songState.customSongIsDraft = false;

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      if (!isLyricsMode && !songState.originalRoot) {
        void detectAndApplySongKeyIfMissing(safeFavorite.chordsSelectedKey || '');
      } else {
        const successMessage = (
          usedLyricsFromChordsFallback
            ? readSongMessage('favoriteCachedLyricsDerived')
            : (
              isLyricsMode
                ? readSongMessage('favoriteCachedLyricsLoaded')
                : readSongMessage('favoriteCachedChordsLoaded')
            )
        );
        setSongFeedback(
          successMessage,
          'is-success'
        );
      }
    } finally {
      setSongActionLoading(triggerButton, false, fallbackLabel);
    }
  };

  const openCustomSongCached = (song, mode, triggerButton) => {
    const safeSong = normalizeCustomSong(song);
    const isLyricsMode = mode === 'lyrics';
    const content = String(isLyricsMode ? safeSong.lyricsText : safeSong.chordsText);
    if (!content.trim()) {
      setSongFeedback(
        isLyricsMode
          ? readSongMessage('customSongLyricsMissing')
          : readSongMessage('customSongChordsMissing'),
        'is-warning'
      );
      return;
    }

    const fallbackLabel = isLyricsMode
      ? readSongMessage('lyricsButton')
      : readSongMessage('chordsButton');
    setSongActionLoading(triggerButton, true, fallbackLabel);
    setSongFeedback(
      isLyricsMode
        ? readSongMessage('customSongLyricsLoading')
        : readSongMessage('customSongChordsLoading'),
      'is-loading'
    );

    try {
      songState.loaded = true;
      songState.title = safeSong.title || readSongMessage('defaultSongTitle');
      songState.artist = '';
      songState.source = 'manual';
      songState.sourceLabel = readSongMessage('customSongsTitle');
      songState.sourceUrl = '';
      songState.semitones = 0;
      songState.originalContent = content;
      songState.customSongId = String(safeSong.id || '').trim();
      songState.customSongIsDraft = Boolean(safeSong.isDraft);

      if (isLyricsMode) {
        songState.originalKey = '';
        songState.originalRoot = null;
        songState.originalSuffix = '';
        songState.contentType = 'lyrics';
      } else {
        songState.originalKey = safeSong.key || '';
        const keyParts = splitKey(songState.originalKey);
        songState.originalRoot = keyParts ? keyParts.root : null;
        songState.originalSuffix = keyParts ? keyParts.suffix : '';
        songState.contentType = 'chords';
      }

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      if (!isLyricsMode && !songState.originalRoot) {
        void detectAndApplySongKeyIfMissing('');
      } else {
        setSongFeedback(
          isLyricsMode
            ? readSongMessage('customSongLyricsLoaded')
            : readSongMessage('customSongChordsLoaded'),
          'is-success'
        );
      }
    } finally {
      setSongActionLoading(triggerButton, false, fallbackLabel);
    }
  };

  const renderSongFavorites = () => {
    if (!songFavoritesCard || !songFavoritesList) return;
    syncHeroShareSongsButtonState();

    const normalizedSearchQuery = normalizeSongMatchToken(songFavoritesSearchQuery);
    const hasActiveSearch = Boolean(normalizedSearchQuery);
    const filteredFavorites = filterSongFavorites(songFavorites, normalizedSearchQuery);

    songFavoritesList.innerHTML = '';
    songFavoritesList.style.maxHeight = '';
    songFavoritesList.classList.remove('is-scrollable');
    songFavoritesCard.hidden = false;
    if (songFavoritesSearchInput) {
      songFavoritesSearchInput.disabled = songFavoritesLoading;
    }
    if (songFavoritesLoading) {
      const loadingItem = document.createElement('li');
      loadingItem.className = 'booklet-cantos-item song-favorite-item song-favorites-empty song-favorites-loading';
      loadingItem.textContent = readSongMessage('favoritesLoading');
      songFavoritesList.appendChild(loadingItem);
      return;
    }

    if (!songFavorites.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'booklet-cantos-item song-favorite-item song-favorites-empty';
      emptyItem.textContent = readSongMessage('favoritesEmpty');
      songFavoritesList.appendChild(emptyItem);
      return;
    }

    if (!filteredFavorites.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'booklet-cantos-item song-favorite-item song-favorites-empty';
      emptyItem.textContent = readSongMessage('favoritesSearchEmpty');
      songFavoritesList.appendChild(emptyItem);
      return;
    }

    filteredFavorites.forEach((favorite) => {
      const item = document.createElement('li');
      item.className = 'booklet-cantos-item song-favorite-item';
      const favoriteId = Number.parseInt(String(favorite.id || ''), 10);
      const isSortable = !hasActiveSearch && Number.isInteger(favoriteId) && favoriteId > 0;
      item.dataset.songFavoriteId = String(favoriteId || '');
      item.dataset.songFavoriteSortable = isSortable ? 'true' : 'false';
      item.draggable = isSortable && !songFavoritesReorderPending;
      item.classList.toggle('is-sortable', isSortable);

      const head = document.createElement('div');
      head.className = 'booklet-cantos-head song-favorite-head';

      const query = [favorite.title, favorite.artist].filter(Boolean).join(' ').trim() || favorite.title;
      const coverButton = document.createElement('button');
      coverButton.type = 'button';
      coverButton.className = 'booklet-cantos-search-btn song-favorite-cover-btn';
      coverButton.dataset.bookletSongQuery = query;
      coverButton.setAttribute(
        'aria-label',
        readSongMessage('favoriteSearchAria', { query })
      );
      coverButton.setAttribute(
        'title',
        readSongMessage('favoriteSearchAria', { query })
      );
      const coverImage = document.createElement('img');
      coverImage.className = 'song-favorite-cover';
      coverImage.loading = 'lazy';
      coverImage.decoding = 'async';
      coverImage.alt = favorite.artist
        ? readSongMessage('avatarAltWithArtist', { artist: favorite.artist })
        : readSongMessage('avatarAltFallback');
      coverImage.src = favorite.imageUrl || songSearchFallbackImage;
      coverImage.addEventListener('error', () => {
        coverImage.src = songSearchFallbackImage;
      });
      coverButton.appendChild(coverImage);

      const title = document.createElement('strong');
      title.className = 'booklet-cantos-title';
      title.textContent = favorite.title || readSongMessage('defaultSongTitle');
      const assignFromFavoriteBtn = document.createElement('button');
      assignFromFavoriteBtn.type = 'button';
      assignFromFavoriteBtn.className = 'song-favorite-title-btn song-open-save-location-trigger';
      assignFromFavoriteBtn.title = readMysteryMessage('assignButtonTitle');
      assignFromFavoriteBtn.setAttribute(
        'aria-label',
        readMysteryMessage('assignButtonAria')
      );
      assignFromFavoriteBtn.disabled = !((favorite.title || '').trim() || (favorite.url || '').trim());
      assignFromFavoriteBtn.appendChild(title);
      assignFromFavoriteBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        captureSongFavoritesScrollPosition(favorite.id, assignFromFavoriteBtn);
        const hasPointerPosition = (
          event instanceof MouseEvent
          && event.detail > 0
          && Number.isFinite(event.clientX)
          && Number.isFinite(event.clientY)
        );
        const openOptions = hasPointerPosition
          ? { clientX: event.clientX, clientY: event.clientY }
          : null;
        void openSongSaveLocationPicker(buildSongPayloadFromFavorite(favorite), assignFromFavoriteBtn, openOptions);
      });
      const footerActions = document.createElement('div');
      footerActions.className = 'song-search-actions song-favorite-actions';

      const meta = document.createElement('p');
      meta.className = 'booklet-cantos-meta';
      const singerPrefix = readSongMessage('singerPrefix');
      const sourcePrefix = readSongMessage('sourcePrefix');
      meta.textContent = favorite.artist
        ? `${singerPrefix} ${favorite.artist} | ${sourcePrefix} ${favorite.sourceLabel}`
        : `${sourcePrefix} ${favorite.sourceLabel}`;

      const externalQuery = buildExternalSongSearchQuery({
        title: favorite.title,
        artist: favorite.artist,
      });
      const urlKey = normalizeSongUrlKey(favorite.url);

      const spotifyAction = document.createElement('a');
      spotifyAction.className = 'song-search-action song-search-action-external';
      spotifyAction.classList.add('song-favorite-action-spotify');
      spotifyAction.innerHTML = SPOTIFY_ACTION_ICON;
      spotifyAction.title = readSongMessage('spotifyTitle');
      spotifyAction.setAttribute('aria-label', readSongMessage('spotifyAria'));
      spotifyAction.href = favorite.spotifyUrl || buildExternalSongSearchUrl('spotify', externalQuery);
      spotifyAction.target = '_blank';
      spotifyAction.rel = 'noopener noreferrer';
      if (!spotifyAction.href) {
        spotifyAction.classList.add('is-disabled');
        spotifyAction.setAttribute('aria-disabled', 'true');
      }

      const youtubeAction = document.createElement('a');
      youtubeAction.className = 'song-search-action song-search-action-external';
      youtubeAction.classList.add('song-favorite-action-youtube');
      youtubeAction.innerHTML = YOUTUBE_ACTION_ICON;
      youtubeAction.title = readSongMessage('youtubeTitle');
      youtubeAction.setAttribute('aria-label', readSongMessage('youtubeAria'));
      youtubeAction.href = favorite.youtubeUrl || buildExternalSongSearchUrl('youtube', externalQuery);
      youtubeAction.target = '_blank';
      youtubeAction.rel = 'noopener noreferrer';
      if (!youtubeAction.href) {
        youtubeAction.classList.add('is-disabled');
        youtubeAction.setAttribute('aria-disabled', 'true');
      }

      const lyricAction = document.createElement('button');
      lyricAction.type = 'button';
      lyricAction.className = 'song-search-action song-search-action-lyrics song-favorite-head-action';
      lyricAction.classList.add('song-favorite-action-lyrics');
      lyricAction.innerHTML = LYRICS_ACTION_ICON;
      lyricAction.title = readSongMessage('lyricsButton');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton'));
      lyricAction.disabled = !favorite.hasLyrics && !favorite.url;
      lyricAction.addEventListener('click', () => openSongFavoriteCached(favorite, 'lyrics', lyricAction));

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action song-search-action-chords song-favorite-head-action';
      chordAction.classList.add('song-favorite-action-chords');
      chordAction.innerHTML = CHORDS_ACTION_ICON;
      chordAction.title = readSongMessage('chordsButton');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton'));
      chordAction.disabled = !favorite.hasChords && !favorite.url;
      chordAction.addEventListener('click', () => openSongFavoriteCached(favorite, 'chords', chordAction));

      const favoriteAction = document.createElement('button');
      favoriteAction.type = 'button';
      favoriteAction.className = 'song-search-action song-search-action-favorite';
      favoriteAction.dataset.songUrlKey = urlKey;
      setFavoriteButtonState(favoriteAction, Boolean(urlKey && songFavoritesByUrl.has(urlKey)), false);
      favoriteAction.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveSongFavorite(buildSongPayloadFromFavorite(favorite), favoriteAction);
      });

      const assignMysteryAction = document.createElement('button');
      assignMysteryAction.type = 'button';
      assignMysteryAction.className = 'song-search-action song-search-action-assign-mystery song-open-save-location-trigger';
      assignMysteryAction.innerHTML = SONG_ASSIGN_PLUS_ICON;
      assignMysteryAction.title = readMysteryMessage('assignButtonTitle');
      assignMysteryAction.setAttribute(
        'aria-label',
        readMysteryMessage('assignButtonAria')
      );
      assignMysteryAction.disabled = !((favorite.title || '').trim() || (favorite.url || '').trim());
      assignMysteryAction.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        captureSongFavoritesScrollPosition(favorite.id, assignMysteryAction);
        const hasPointerPosition = (
          event instanceof MouseEvent
          && event.detail > 0
          && Number.isFinite(event.clientX)
          && Number.isFinite(event.clientY)
        );
        const openOptions = hasPointerPosition
          ? { clientX: event.clientX, clientY: event.clientY }
          : null;
        void openSongSaveLocationPicker(buildSongPayloadFromFavorite(favorite), assignMysteryAction, openOptions);
      });

      head.appendChild(coverButton);
      head.appendChild(assignFromFavoriteBtn);
      item.appendChild(head);
      item.appendChild(meta);
      const usageLabels = dedupeUsageLabels([
        ...(Array.isArray(favorite.usageLocations) ? favorite.usageLocations : []),
        ...resolveSongMysteryUsageLabels(favorite),
        ...resolveSongLocationUsageLabels(favorite),
      ]);
      if (usageLabels.length) {
        const usageNode = document.createElement('p');
        usageNode.className = 'song-favorite-usage';
        usageNode.textContent = usageLabels.join(' | ');
        item.appendChild(usageNode);
      }
      footerActions.appendChild(spotifyAction);
      footerActions.appendChild(youtubeAction);
      footerActions.appendChild(lyricAction);
      footerActions.appendChild(chordAction);
      footerActions.appendChild(favoriteAction);
      footerActions.appendChild(assignMysteryAction);
      item.appendChild(footerActions);
      songFavoritesList.appendChild(item);
    });
    scheduleSongFavoritesLayoutSync();
    restoreSongFavoritesScrollPosition();
  };

  const applySongFavorites = (favorites) => {
    const normalizedFavorites = Array.isArray(favorites)
      ? favorites.map(normalizeSongFavorite).filter((favorite) => Boolean(normalizeSongUrlKey(favorite.url)))
      : [];
    normalizedFavorites.forEach((favorite) => {
      if (!favorite?.url || !favorite?.chordsSelectedKey) return;
      rememberSongSelectedKey(favorite.url, favorite.chordsSelectedKey);
    });
    songFavorites = sortSongFavoritesByOrder(normalizedFavorites);
    rebuildSongFavoritesIndex();
    renderSongFavorites();
    document.querySelectorAll('.song-search-action-favorite').forEach((button) => {
      const urlKey = normalizeSongUrlKey(button.dataset.songUrlKey || '');
      setFavoriteButtonState(button, Boolean(urlKey && songFavoritesByUrl.has(urlKey)), false);
    });
  };

  const upsertSongFavorite = (favoritePayload) => {
    const favorite = normalizeSongFavorite(favoritePayload);
    const urlKey = normalizeSongUrlKey(favorite.url);
    if (!urlKey) return null;

    const existingIndex = songFavorites.findIndex((item) => normalizeSongUrlKey(item.url) === urlKey);
    if (existingIndex >= 0) {
      songFavorites[existingIndex] = favorite;
    } else {
      songFavorites.push(favorite);
    }
    songFavorites = sortSongFavoritesByOrder(songFavorites);

    rebuildSongFavoritesIndex();
    renderSongFavorites();
    applyFavoriteStateToRenderedButtons(urlKey, true);
    return favorite;
  };

  const removeSongFavoriteByUrl = (urlKey) => {
    if (!urlKey) return false;
    if (
      songToneFavoritePersistContext
      && normalizeSongUrlKey(songToneFavoritePersistContext.url || '') === urlKey
    ) {
      songToneFavoritePersistContext = null;
      if (songToneFavoritePersistTimerId !== null) {
        window.clearTimeout(songToneFavoritePersistTimerId);
        songToneFavoritePersistTimerId = null;
      }
    }
    const previousCount = songFavorites.length;
    songFavorites = songFavorites.filter((item) => normalizeSongUrlKey(item.url) !== urlKey);
    if (songFavorites.length === previousCount) return false;
    rebuildSongFavoritesIndex();
    renderSongFavorites();
    applyFavoriteStateToRenderedButtons(urlKey, false);
    return true;
  };

  const removeCachedSongAssignmentsByIdentity = (songPayload) => {
    const songIdentity = readSongIdentityForMatch(songPayload);
    if (!songIdentity.urlKey && !songIdentity.titleArtistKey && !songIdentity.titleKey) {
      return {
        mysteryCount: 0,
        locationCount: 0,
      };
    }

    let mysteryCount = 0;
    Object.entries(asObject(mysterySongAssignments)).forEach(([, assignmentPayload]) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      if (!isSongIdentityMatch(songIdentity, assignmentIdentity)) return;

      const groupTitle = String(assignment.groupTitle || assignment.group_title || '').trim();
      const mysteryTitle = normalizeMysteryName(assignment.mysteryTitle || assignment.mystery_title || '');
      if (removeCachedMysterySongAssignment(groupTitle, mysteryTitle)) {
        mysteryCount += 1;
      }
    });

    let locationCount = 0;
    Object.entries(asObject(songLocationAssignments)).forEach(([locationId, assignmentPayload]) => {
      const assignment = asObject(assignmentPayload);
      const assignmentIdentity = readSongIdentityForMatch({
        url: assignment.songUrl || assignment.song_url || '',
        title: assignment.songTitle || assignment.song_title || '',
        artist: assignment.songArtist || assignment.song_artist || '',
      });
      if (!isSongIdentityMatch(songIdentity, assignmentIdentity)) return;

      if (removeCachedSongLocationAssignment(locationId)) {
        locationCount += 1;
      }
    });

    return {
      mysteryCount,
      locationCount,
    };
  };

  const applyFavoriteAssignmentCleanup = (responsePayload, fallbackSongPayload = null) => {
    const payload = asObject(responsePayload);
    const cleanup = asObject(payload.assignment_cleanup || payload.assignmentCleanup);
    const mysteryCleanup = asObject(cleanup.mystery);
    const locationCleanup = asObject(cleanup.location);

    let mysteryCount = 0;
    const removedMysteryAssignments = Array.isArray(mysteryCleanup.removed_assignments)
      ? mysteryCleanup.removed_assignments
      : (Array.isArray(mysteryCleanup.removedAssignments) ? mysteryCleanup.removedAssignments : []);
    removedMysteryAssignments.forEach((rowPayload) => {
      const row = asObject(rowPayload);
      const groupTitle = String(row.group_title || row.groupTitle || '').trim();
      const mysteryTitle = normalizeMysteryName(row.mystery_title || row.mysteryTitle || '');
      if (removeCachedMysterySongAssignment(groupTitle, mysteryTitle)) {
        mysteryCount += 1;
      }
    });

    let locationCount = 0;
    const removedLocationIds = Array.isArray(locationCleanup.removed_location_ids)
      ? locationCleanup.removed_location_ids
      : (Array.isArray(locationCleanup.removedLocationIds) ? locationCleanup.removedLocationIds : []);
    removedLocationIds.forEach((rawLocationId) => {
      const locationId = String(rawLocationId || '').trim();
      if (!locationId) return;
      if (removeCachedSongLocationAssignment(locationId)) {
        locationCount += 1;
      }
    });

    if (!mysteryCount && !locationCount && fallbackSongPayload) {
      const fallbackCleanup = removeCachedSongAssignmentsByIdentity(fallbackSongPayload);
      mysteryCount = fallbackCleanup.mysteryCount;
      locationCount = fallbackCleanup.locationCount;
    }

    if (mysteryCount > 0) {
      updateMysteryModalSongToggleState();
    }
    if (locationCount > 0) {
      renderSongSaveLocationPicker();
      updateRosaryModalSongToggleState();
    }
  };

  const saveSongFavorite = async (result, triggerButton, widget = null) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para salvar favoritos.',
      trigger: triggerButton,
    })) {
      return;
    }

    const safeResult = asObject(result);
    const sourceUrl = (safeResult.url || '').trim();
    const urlKey = normalizeSongUrlKey(sourceUrl);
    if (!sourceUrl || !urlKey) {
      setSongFeedback(
        readSongMessage('favoriteSaveError'),
        'is-error',
        widget
      );
      return;
    }

    if (songFavoritesByUrl.has(urlKey)) {
      const favoriteTitle = (safeResult.title || songFavoritesByUrl.get(urlKey)?.title || '').trim();
      const shouldRemove = await openFavoriteConfirmModal(triggerButton, favoriteTitle);
      if (!shouldRemove) {
        setFavoriteButtonState(triggerButton, true, false);
        return;
      }
      const favoritesSnapshot = songFavorites.map((item) => ({ ...item }));
      removeSongFavoriteByUrl(urlKey);
      setFavoriteButtonState(triggerButton, false, true);
      setSongFeedback(
        readSongMessage('favoriteButtonRemoving'),
        'is-loading',
        widget
      );
      try {
        const response = await fetch(`/api/songs/favorites?url=${encodeURIComponent(sourceUrl)}`, {
          method: 'DELETE',
          headers: buildUserScopedApiHeaders(),
        });
        const payload = asObject(await response.json().catch(() => ({})));
        if (isUserScopedApiUnauthorized(response)) {
          handleUserScopedApiUnauthorized({
            notify: true,
            openLoginModal: true,
            trigger: triggerButton,
          });
          throw new Error('Sessão expirada. Faça login novamente.');
        }
        if (!response.ok || !payload.ok) {
          const message = payload?.detail?.message
            || payload?.message
            || readSongMessage('favoriteRemoveError');
          throw new Error(message);
        }

        applyFavoriteAssignmentCleanup(payload, safeResult);
        setFavoriteButtonState(triggerButton, false, false);
        setSongFeedback(
          readSongMessage('favoriteRemoveSuccess'),
          'is-success',
          widget
        );
      } catch (err) {
        applySongFavorites(favoritesSnapshot);
        applyFavoriteStateToRenderedButtons(urlKey, true);
        const message = err instanceof Error
          ? err.message
          : readSongMessage('favoriteRemoveError');
        setSongFeedback(message, 'is-error', widget);
        setFavoriteButtonState(triggerButton, true, false);
      }
      return;
    }

    setFavoriteButtonState(triggerButton, false, true);
    setSongFeedback(
      readSongMessage('favoriteButtonSaving'),
      'is-loading',
      widget
    );

    try {
      const externalQuery = buildExternalSongSearchQuery(safeResult);
      const spotifyUrl = buildExternalSongSearchUrl('spotify', externalQuery);
      const youtubeUrl = buildExternalSongSearchUrl('youtube', externalQuery);
      const selectedToneForFavorite = (
        songState.loaded
        && songState.contentType === 'chords'
        && normalizeSongUrlKey(songState.sourceUrl || '') === urlKey
      )
        ? resolveCurrentSongSelectedKeyForSave()
        : '';
      const optimisticTimestamp = new Date().toISOString();
      upsertSongFavorite({
        url: sourceUrl,
        title: safeResult.title || '',
        artist: safeResult.artist || '',
        source: safeResult.source || '',
        source_label: safeResult.source_label || '',
        image_url: safeResult.image_url || '',
        spotify_url: spotifyUrl,
        youtube_url: youtubeUrl,
        chords_selected_key: selectedToneForFavorite,
        updated_at_utc: optimisticTimestamp,
        created_at_utc: optimisticTimestamp,
      });
      const response = await fetch('/api/songs/favorites', {
        method: 'POST',
        headers: buildUserScopedApiHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          url: sourceUrl,
          title: safeResult.title || '',
          artist: safeResult.artist || '',
          source: safeResult.source || '',
          source_label: safeResult.source_label || '',
          image_url: safeResult.image_url || '',
          spotify_url: spotifyUrl,
          youtube_url: youtubeUrl,
          chords_selected_key: selectedToneForFavorite,
        }),
      });

      const payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized({
          notify: true,
          openLoginModal: true,
          trigger: triggerButton,
        });
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message
          || payload?.message
          || readSongMessage('favoriteSaveError');
        throw new Error(message);
      }

      const savedFavorite = upsertSongFavorite(payload.favorite);
      if (savedFavorite) {
        const savedKey = normalizeSongUrlKey(savedFavorite.url);
        applyFavoriteStateToRenderedButtons(savedKey, true);
      }
      setSongFeedback(
        readSongMessage('favoriteSaveSuccess'),
        'is-success',
        widget
      );
    } catch (err) {
      removeSongFavoriteByUrl(urlKey);
      const message = err instanceof Error
        ? err.message
        : readSongMessage('favoriteSaveError');
      setSongFeedback(message, 'is-error', widget);
      setFavoriteButtonState(triggerButton, false, false);
    }
  };

  const fetchSongFavorites = async (options = {}) => {
    const safeOptions = asObject(options);
    const forceRefresh = safeOptions.forceRefresh === true;

    if (songShareViewModeLoaded) {
      songFavoritesRefreshQueued = false;
      songFavoritesLoading = false;
      renderSongFavorites();
      return false;
    }

    if (!isAuthLoggedIn()) {
      songFavoritesRefreshQueued = false;
      songFavoritesLoading = false;
      applySongFavorites([]);
      return false;
    }

    if (songFavoritesLoading) {
      if (forceRefresh) {
        songFavoritesRefreshQueued = true;
      }
      return false;
    }

    if (!songFavoritesLoading && !Number.isFinite(songFavoritesPendingScrollRestoreTop)) {
      captureSongFavoritesScrollPosition();
    }
    songFavoritesLoading = true;
    renderSongFavorites();
    try {
      const response = await fetch('/api/songs/favorites', {
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        applySongFavorites([]);
        return false;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.detail?.message
          || payload?.message
          || readSongMessage('favoritesLoadError')
        );
      }

      applySongFavorites(Array.isArray(payload.favorites) ? payload.favorites : []);
      return true;
    } catch (err) {
      songFavorites = [];
      rebuildSongFavoritesIndex();
      renderSongFavorites();
      return false;
    } finally {
      songFavoritesLoading = false;
      if (
        songFavoritesRefreshQueued
        && isAuthLoggedIn()
        && !songShareViewModeLoaded
      ) {
        songFavoritesRefreshQueued = false;
        runDeferredTask(fetchSongFavorites, 140);
      }
    }
  };

  const reorderSongFavoritesOnServer = async (orderedIds) => {
    const normalizedIds = Array.isArray(orderedIds)
      ? orderedIds
        .map((id) => Number.parseInt(String(id || '').trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!normalizedIds.length) {
      return sortSongFavoritesByOrder(songFavorites);
    }
    if (!isAuthLoggedIn()) {
      throw new Error('Faça login para reordenar favoritos.');
    }

    const response = await fetch('/api/songs/favorites/order', {
      method: 'PUT',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ ordered_ids: normalizedIds }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      const message = responsePayload?.detail?.message
        || responsePayload?.message
        || readSongMessage('favoritesReorderError');
      throw new Error(message);
    }
    return Array.isArray(responsePayload.favorites)
      ? responsePayload.favorites.map(normalizeSongFavorite)
      : [];
  };

  const readSortableSongFavoriteIdsFromDom = () => {
    if (!songFavoritesList) return [];
    return Array.from(
      songFavoritesList.querySelectorAll('.song-favorite-item[data-song-favorite-sortable="true"]')
    )
      .map((item) => Number.parseInt(String(item.dataset.songFavoriteId || '').trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
  };

  const persistSongFavoritesOrderFromDom = async () => {
    if (songFavoritesReorderPending) return;
    const orderedIds = readSortableSongFavoriteIdsFromDom();
    if (!orderedIds.length) return;

    songFavoritesReorderPending = true;
    try {
      const persistedFavorites = await reorderSongFavoritesOnServer(orderedIds);
      applySongFavorites(persistedFavorites);
      showSongToast(
        readSongMessage('favoritesReorderSuccess'),
        'is-success'
      );
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('favoritesReorderError');
      showSongToast(message, 'is-error');
      await fetchSongFavorites();
    } finally {
      songFavoritesReorderPending = false;
      renderSongFavorites();
    }
  };

  const CUSTOM_SONG_DRAFT_STORAGE_KEY = 'portal_custom_song_draft_v1';
  const CUSTOM_SONG_DRAFT_INTERVAL_MS = 30000;
  const CUSTOM_SONG_TAB_LYRICS = 'lyrics';
  const CUSTOM_SONG_TAB_CHORDS = 'chords';
  const CUSTOM_SONG_EDIT_DRAFT_PREFIX = 'draft-edit-';
  let customSongs = [];
  let customSongsLoading = false;
  let customSongsRefreshQueued = false;
  let customSongEditingId = '';
  let customSongDraftTimerId = null;
  let customSongActiveTab = CUSTOM_SONG_TAB_LYRICS;
  let customSongDragId = '';
  let customSongDragStartOrder = [];
  let customSongsReorderPending = false;

  const isDraftGeneratedCustomSongId = (id) => String(id || '').trim().startsWith('draft-');
  const parseCustomSongEditDraftTargetId = (id) => {
    const safeId = String(id || '').trim();
    if (!safeId.startsWith(CUSTOM_SONG_EDIT_DRAFT_PREFIX)) return '';
    return safeId.slice(CUSTOM_SONG_EDIT_DRAFT_PREFIX.length).trim();
  };
  const buildCustomSongEditDraftId = (songId) => {
    const safeSongId = String(songId || '').trim();
    return safeSongId ? `${CUSTOM_SONG_EDIT_DRAFT_PREFIX}${safeSongId}` : '';
  };

  const isStorageAvailable = () => {
    try {
      return Boolean(window.localStorage);
    } catch (err) {
      return false;
    }
  };

  const safeStorageRead = (key) => {
    if (!isStorageAvailable()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  };

  const safeStorageWrite = (key, value) => {
    if (!isStorageAvailable()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  };

  const safeStorageRemove = (key) => {
    if (!isStorageAvailable()) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  };

  const normalizeCustomSong = (raw) => {
    const payload = asObject(raw);
    const parsedOrderIndex = Number.parseInt(String(payload.orderIndex ?? payload.order_index ?? ''), 10);
    return {
      id: String(payload.id || ''),
      title: String(payload.title || '').trim(),
      key: String(payload.key || '').trim(),
      lyricsText: String(payload.lyricsText || payload.lyrics_text || ''),
      chordsText: String(payload.chordsText || payload.chords_text || ''),
      orderIndex: Number.isInteger(parsedOrderIndex) && parsedOrderIndex > 0 ? parsedOrderIndex : 0,
      createdAtUtc: String(payload.createdAtUtc || payload.created_at_utc || '').trim(),
      updatedAtUtc: String(payload.updatedAtUtc || payload.updated_at_utc || '').trim(),
      isDraft: Boolean(payload.isDraft),
    };
  };

  const setPersistedCustomSongs = (songs) => {
    const drafts = customSongs.filter((song) => song.isDraft);
    const persistedSongsNormalized = Array.isArray(songs)
      ? songs
        .map((song) => ({ ...normalizeCustomSong(song), isDraft: false }))
        .filter((song) => song.id)
      : [];
    const persistedById = new Map(persistedSongsNormalized.map((song) => [song.id, song]));
    const draftsWithPersistedMeta = drafts.map((draft) => {
      const draftId = String(draft.id || '').trim();
      const editTargetId = parseCustomSongEditDraftTargetId(draftId);
      const persistedMatch = persistedById.get(draftId)
        || (editTargetId ? persistedById.get(editTargetId) : null);
      if (!persistedMatch) return draft;
      return {
        ...draft,
        createdAtUtc: persistedMatch.createdAtUtc || draft.createdAtUtc,
        updatedAtUtc: persistedMatch.updatedAtUtc || draft.updatedAtUtc,
      };
    });

    const hiddenPersistedIds = new Set();
    draftsWithPersistedMeta.forEach((draft) => {
      const draftId = String(draft.id || '').trim();
      if (!draftId) return;
      if (persistedById.has(draftId)) {
        hiddenPersistedIds.add(draftId);
      }
      const editTargetId = parseCustomSongEditDraftTargetId(draftId);
      if (editTargetId && persistedById.has(editTargetId)) {
        hiddenPersistedIds.add(editTargetId);
      }
    });

    const persistedSongs = persistedSongsNormalized.filter((song) => !hiddenPersistedIds.has(song.id));
    customSongs = [...draftsWithPersistedMeta, ...persistedSongs];
  };

  const parseCustomSongApiError = (payload, fallbackMessage) => (
    payload?.detail?.message
    || payload?.message
    || fallbackMessage
  );

  const fetchCustomSongs = async (options = {}) => {
    const safeOptions = asObject(options);
    const forceRefresh = safeOptions.forceRefresh === true;

    if (!isAuthLoggedIn()) {
      customSongsRefreshQueued = false;
      customSongsLoading = false;
      setPersistedCustomSongs([]);
      syncStoredCustomDraftToSongList();
      renderCustomSongs();
      return false;
    }

    if (customSongsLoading) {
      if (forceRefresh) {
        customSongsRefreshQueued = true;
      }
      return false;
    }
    customSongsLoading = true;
    try {
      const response = await fetch('/api/songs/custom', {
        headers: buildUserScopedApiHeaders(),
        cache: 'no-store',
      });
      const payload = asObject(await response.json().catch(() => ({})));
      if (isUserScopedApiUnauthorized(response)) {
        handleUserScopedApiUnauthorized();
        setPersistedCustomSongs([]);
        syncStoredCustomDraftToSongList();
        renderCustomSongs();
        return false;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(
          parseCustomSongApiError(
            payload,
            readSongMessage('customSongsLoadError')
          )
        );
      }
      setPersistedCustomSongs(Array.isArray(payload.songs) ? payload.songs : []);
      syncStoredCustomDraftToSongList();
      renderCustomSongs();
      return true;
    } catch (err) {
      setPersistedCustomSongs([]);
      syncStoredCustomDraftToSongList();
      renderCustomSongs();
      return false;
    } finally {
      customSongsLoading = false;
      if (customSongsRefreshQueued && isAuthLoggedIn()) {
        customSongsRefreshQueued = false;
        runDeferredTask(fetchCustomSongs, 160);
      }
    }
  };

  const createCustomSongOnServer = async (payload) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para criar música personalizada.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const response = await fetch('/api/songs/custom', {
      method: 'POST',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongSaveError')
        )
      );
    }
    return normalizeCustomSong(responsePayload.song);
  };

  const updateCustomSongOnServer = async (songId, payload) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para alterar música personalizada.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeSongId = String(songId || '').trim();
    if (!safeSongId) {
      throw new Error(readSongMessage('customSongSaveError'));
    }

    const response = await fetch(`/api/songs/custom/${encodeURIComponent(safeSongId)}`, {
      method: 'PUT',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongSaveError')
        )
      );
    }
    return normalizeCustomSong(responsePayload.song);
  };

  const reorderCustomSongsOnServer = async (orderedIds) => {
    const normalizedIds = Array.isArray(orderedIds)
      ? orderedIds
        .map((id) => Number.parseInt(String(id || '').trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!normalizedIds.length) {
      return customSongs.filter((song) => !song.isDraft);
    }
    if (!isAuthLoggedIn()) {
      throw new Error('Faça login para reordenar músicas personalizadas.');
    }

    const response = await fetch('/api/songs/custom/order', {
      method: 'PUT',
      headers: buildUserScopedApiHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ ordered_ids: normalizedIds }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongsReorderError')
        )
      );
    }
    return Array.isArray(responsePayload.songs)
      ? responsePayload.songs.map((song) => ({ ...normalizeCustomSong(song), isDraft: false }))
      : [];
  };

  const deleteCustomSongOnServer = async (songId) => {
    if (!ensureLoggedInForUserScopedAction({
      message: 'Faça login para remover música personalizada.',
      notify: false,
    })) {
      throw new Error('Autenticacao obrigatoria.');
    }

    const safeSongId = String(songId || '').trim();
    if (!safeSongId) {
      throw new Error(readSongMessage('customSongRemoveError'));
    }

    const response = await fetch(`/api/songs/custom/${encodeURIComponent(safeSongId)}`, {
      method: 'DELETE',
      headers: buildUserScopedApiHeaders(),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (isUserScopedApiUnauthorized(response)) {
      handleUserScopedApiUnauthorized({ notify: true, openLoginModal: true });
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongRemoveError')
        )
      );
    }
    return Boolean(responsePayload.removed);
  };

  const readCustomSongDraftFromStorage = () => {
    const raw = safeStorageRead(CUSTOM_SONG_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = asObject(JSON.parse(raw));
      const draft = {
        id: String(parsed.id || '').trim(),
        title: String(parsed.title || ''),
        key: String(parsed.key || ''),
        lyricsText: String(parsed.lyricsText || ''),
        chordsText: String(parsed.chordsText || ''),
        tab: parsed.tab === CUSTOM_SONG_TAB_CHORDS ? CUSTOM_SONG_TAB_CHORDS : CUSTOM_SONG_TAB_LYRICS,
        savedAtUtc: String(parsed.savedAtUtc || '').trim(),
        persistedUpdatedAtUtc: String(parsed.persistedUpdatedAtUtc || '').trim(),
      };
      const hasAnyContent = Boolean(
        draft.title.trim()
        || draft.key.trim()
        || draft.lyricsText.trim()
        || draft.chordsText.trim()
      );
      return hasAnyContent ? draft : null;
    } catch (err) {
      return null;
    }
  };

  const clearCustomSongDraft = () => {
    safeStorageRemove(CUSTOM_SONG_DRAFT_STORAGE_KEY);
  };

  const setCustomSongDraftStatus = (message, type = '') => {
    if (!customSongDraftStatus) return;
    customSongDraftStatus.textContent = message || '';
    customSongDraftStatus.classList.remove('is-success', 'is-error');
    if (type) {
      customSongDraftStatus.classList.add(type);
    }
  };

  const formatCustomSongDateTime = (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      const parts = new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }).formatToParts(date);
      const part = (type) => parts.find((item) => item.type === type)?.value || '';
      return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}:${part('second')}`;
    } catch (err) {
      const pad = (num) => String(num).padStart(2, '0');
      return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    }
  };

  const getCustomSongById = (id) => (
    customSongs.find((song) => song.id === String(id || '').trim()) || null
  );

  const syncStoredCustomDraftToSongList = () => {
    const draft = readCustomSongDraftFromStorage();
    if (!draft) {
      const hadDraft = customSongs.some((song) => song.isDraft);
      if (hadDraft) {
        customSongs = customSongs.filter((song) => !song.isDraft);
      }
      return false;
    }

    const nowIso = String(draft.savedAtUtc || '').trim() || new Date().toISOString();
    const storedDraftId = String(draft.id || '').trim();
    const editTargetId = parseCustomSongEditDraftTargetId(storedDraftId);
    const persistedUpdatedAtUtc = String(draft.persistedUpdatedAtUtc || '').trim();
    const targetId = editTargetId || storedDraftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = getCustomSongById(targetId);
    const isEditDraft = Boolean(editTargetId);
    const baseUpdatedAtUtc = (
      isEditDraft
        ? (
          String(existing?.updatedAtUtc || '').trim()
          || persistedUpdatedAtUtc
          || nowIso
        )
        : nowIso
    );

    const nextItem = {
      id: targetId,
      title: String(draft.title || '').trim(),
      key: String(draft.key || '').trim(),
      lyricsText: String(draft.lyricsText || ''),
      chordsText: String(draft.chordsText || ''),
      createdAtUtc: existing?.createdAtUtc || nowIso,
      updatedAtUtc: baseUpdatedAtUtc,
      isDraft: true,
    };

    customSongs = customSongs.filter((song) => !song.isDraft || song.id === targetId);
    if (existing) {
      customSongs = customSongs.map((song) => (
        song.id === targetId ? nextItem : song
      ));
    } else {
      customSongs.unshift(nextItem);
    }

    const normalizedDraftId = editTargetId
      ? buildCustomSongEditDraftId(targetId)
      : targetId;
    const storedDraft = safeStorageWrite(
      CUSTOM_SONG_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        id: normalizedDraftId,
        savedAtUtc: nowIso,
        persistedUpdatedAtUtc: isEditDraft ? baseUpdatedAtUtc : '',
      })
    );

    return Boolean(storedDraft);
  };

  const clearUserScopedSongData = () => {
    songShareViewModeLoaded = false;
    songShareCurrentViewId = '';
    pendingSongShareMergeAfterLogin = false;
    songFavoritesLoading = false;
    applySongFavorites([]);
    songLocationTreeLoading = false;
    songLocationTreeRoots = [];
    mysterySongAssignmentsLoading = false;
    mysterySongAssignments = {};
    songLocationAssignmentsLoading = false;
    songLocationAssignments = {};
    setPersistedCustomSongs([]);
    syncStoredCustomDraftToSongList();
    renderCustomSongs();
    updateMysteryModalSongToggleState();
    renderSongFavorites();
    renderSongSaveLocationPicker();
    syncSongShareImportButtonState();
    runDeferredTask(fetchSongLocationTree, 40);
  };

  const refreshUserScopedSongDataNow = async (options = {}) => {
    if (!isAuthLoggedIn()) {
      clearUserScopedSongData();
      return false;
    }
    const safeOptions = asObject(options);
    const includeAssignments = safeOptions.includeAssignments !== false;
    const forceSongLists = safeOptions.forceSongLists === true;
    songShareViewModeLoaded = false;

    await fetchSongFavorites({ forceRefresh: forceSongLists });
    if (includeAssignments) {
      await fetchMysterySongAssignments();
    }
    await fetchSongLocationTree();
    if (includeAssignments) {
      await fetchSongLocationAssignments();
    }
    await fetchCustomSongs({ forceRefresh: forceSongLists });
    return true;
  };

  const refreshUserScopedSongData = (baseDelay = 0, options = {}) => {
    if (!isAuthLoggedIn()) {
      clearUserScopedSongData();
      return;
    }
    songShareViewModeLoaded = false;
    const safeOptions = asObject(options);
    const includeAssignments = safeOptions.includeAssignments !== false;
    const forceSongLists = safeOptions.forceSongLists === true;
    const safeDelay = Number.isFinite(baseDelay) ? Math.max(0, Math.trunc(baseDelay)) : 0;
    runDeferredTask(() => fetchSongFavorites({ forceRefresh: forceSongLists }), safeDelay + 40);
    if (includeAssignments) {
      runDeferredTask(fetchMysterySongAssignments, safeDelay + 80);
    }
    runDeferredTask(fetchSongLocationTree, safeDelay + 120);
    if (includeAssignments) {
      runDeferredTask(fetchSongLocationAssignments, safeDelay + 160);
    }
    runDeferredTask(() => fetchCustomSongs({ forceRefresh: forceSongLists }), safeDelay + 200);
  };

  const setCustomSongTab = (tabName) => {
    const targetTab = tabName === CUSTOM_SONG_TAB_CHORDS ? CUSTOM_SONG_TAB_CHORDS : CUSTOM_SONG_TAB_LYRICS;
    customSongActiveTab = targetTab;

    if (customSongTabLyricsBtn) {
      const active = targetTab === CUSTOM_SONG_TAB_LYRICS;
      customSongTabLyricsBtn.classList.toggle('is-active', active);
      customSongTabLyricsBtn.setAttribute('aria-selected', String(active));
    }
    if (customSongTabChordsBtn) {
      const active = targetTab === CUSTOM_SONG_TAB_CHORDS;
      customSongTabChordsBtn.classList.toggle('is-active', active);
      customSongTabChordsBtn.setAttribute('aria-selected', String(active));
    }
    if (customSongPanelLyrics) {
      customSongPanelLyrics.hidden = targetTab !== CUSTOM_SONG_TAB_LYRICS;
    }
    if (customSongPanelChords) {
      customSongPanelChords.hidden = targetTab !== CUSTOM_SONG_TAB_CHORDS;
    }
  };

  const collectCustomSongFormData = () => ({
    title: (customSongTitleInput?.value || '').trim(),
    key: (customSongKeyInput?.value || '').trim(),
    lyricsText: String(customSongLyricsInput?.value || ''),
    chordsText: String(customSongChordsInput?.value || ''),
    tab: customSongActiveTab,
  });

  const fillCustomSongForm = (payload) => {
    const safePayload = asObject(payload);
    if (customSongTitleInput) customSongTitleInput.value = String(safePayload.title || '');
    if (customSongKeyInput) customSongKeyInput.value = String(safePayload.key || '');
    if (customSongLyricsInput) customSongLyricsInput.value = String(safePayload.lyricsText || '');
    if (customSongChordsInput) customSongChordsInput.value = String(safePayload.chordsText || '');
    setCustomSongTab(safePayload.tab === CUSTOM_SONG_TAB_CHORDS ? CUSTOM_SONG_TAB_CHORDS : CUSTOM_SONG_TAB_LYRICS);
  };

  const upsertCustomSongDraftEntry = (payload, savedAtUtc) => {
    const safePayload = asObject(payload);
    const hasAnyContent = Boolean(
      String(safePayload.title || '').trim()
      || String(safePayload.key || '').trim()
      || String(safePayload.lyricsText || '').trim()
      || String(safePayload.chordsText || '').trim()
    );
    if (!hasAnyContent) return true;

    const editingSong = customSongEditingId ? getCustomSongById(customSongEditingId) : null;
    if (editingSong && !editingSong.isDraft) {
      return true;
    }

    const nowIso = String(savedAtUtc || '').trim() || new Date().toISOString();
    if (!customSongEditingId) {
      customSongEditingId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const existing = getCustomSongById(customSongEditingId);
    const nextItem = {
      id: customSongEditingId,
      title: String(safePayload.title || '').trim(),
      key: String(safePayload.key || '').trim(),
      lyricsText: String(safePayload.lyricsText || ''),
      chordsText: String(safePayload.chordsText || ''),
      createdAtUtc: existing?.createdAtUtc || nowIso,
      updatedAtUtc: nowIso,
      isDraft: true,
    };

    if (existing) {
      customSongs = customSongs.map((song) => (
        song.id === customSongEditingId ? nextItem : song
      ));
    } else {
      customSongs.unshift(nextItem);
    }

    renderCustomSongs();
    return true;
  };

  const persistCustomSongDraft = (showStatus = false) => {
    if (!customSongModal || !customSongModal.classList.contains('open')) return false;

    const payload = collectCustomSongFormData();
    const hasAnyContent = Boolean(
      payload.title
      || payload.key
      || payload.lyricsText.trim()
      || payload.chordsText.trim()
    );
    if (!hasAnyContent) {
      clearCustomSongDraft();
      if (customSongEditingId) {
        const safeEditingId = String(customSongEditingId || '').trim();
        const editingTargetFromDraft = parseCustomSongEditDraftTargetId(safeEditingId);
        const isPersistedEditingSongId = Boolean(
          safeEditingId
          && !editingTargetFromDraft
          && !isDraftGeneratedCustomSongId(safeEditingId)
        );
        const existing = getCustomSongById(customSongEditingId);
        if (existing && existing.isDraft && !isPersistedEditingSongId) {
          customSongs = customSongs.filter((song) => song.id !== customSongEditingId);
          renderCustomSongs();
          customSongEditingId = '';
        }
      }
      if (showStatus) {
        setCustomSongDraftStatus('');
      }
      return true;
    }

    const safeEditingId = String(customSongEditingId || '').trim();
    const editingTargetFromDraft = parseCustomSongEditDraftTargetId(safeEditingId);
    const isEditingPersistedSongId = Boolean(
      safeEditingId
      && !editingTargetFromDraft
      && !isDraftGeneratedCustomSongId(safeEditingId)
    );
    const editingPersistedId = editingTargetFromDraft || (isEditingPersistedSongId ? safeEditingId : '');
    const draftId = editingPersistedId
      ? buildCustomSongEditDraftId(editingPersistedId)
      : (safeEditingId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    if (!safeEditingId) {
      customSongEditingId = draftId;
    }
    const savedAtUtc = new Date().toISOString();
    const stored = safeStorageWrite(
      CUSTOM_SONG_DRAFT_STORAGE_KEY,
      JSON.stringify({
        id: draftId,
        ...payload,
        savedAtUtc,
      })
    );
    const storedSong = stored
      ? upsertCustomSongDraftEntry(payload, savedAtUtc)
      : false;
    const success = Boolean(stored && storedSong);

    if (showStatus) {
      setCustomSongDraftStatus(
        success
          ? readSongMessage('customSongDraftSaved')
          : readSongMessage('customSongDraftSaveError'),
        success ? 'is-success' : 'is-error'
      );
    }
    return success;
  };

  const stopCustomSongDraftAutosave = () => {
    if (customSongDraftTimerId !== null) {
      window.clearInterval(customSongDraftTimerId);
      customSongDraftTimerId = null;
    }
  };

  const startCustomSongDraftAutosave = () => {
    stopCustomSongDraftAutosave();
    customSongDraftTimerId = window.setInterval(() => {
      persistCustomSongDraft(false);
    }, CUSTOM_SONG_DRAFT_INTERVAL_MS);
  };

  const renderCustomSongs = () => {
    if (!customSongsCard || !customSongsList) return;
    customSongsCard.hidden = false;
    customSongsList.innerHTML = '';

    if (!customSongs.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'custom-song-item custom-song-empty';
      emptyItem.textContent = readSongMessage('customSongsEmpty');
      customSongsList.appendChild(emptyItem);
      return;
    }

    customSongs.forEach((song) => {
      const item = document.createElement('li');
      item.className = 'custom-song-item';
      item.dataset.customSongId = song.id;
      const isSortable = !song.isDraft && /^\d+$/.test(String(song.id || '').trim());
      item.dataset.customSongSortable = isSortable ? 'true' : 'false';
      item.draggable = isSortable;
      item.classList.toggle('is-sortable', isSortable);

      const head = document.createElement('div');
      head.className = 'custom-song-item-head';

      const titleNode = document.createElement('h4');
      titleNode.className = 'custom-song-item-title';
      titleNode.textContent = song.title || readSongMessage('defaultSongTitle');

      const headActions = document.createElement('div');
      headActions.className = 'song-favorite-head-actions custom-song-item-head-actions';

      const lyricAction = document.createElement('button');
      lyricAction.type = 'button';
      lyricAction.className = 'song-search-action song-favorite-head-action custom-song-item-head-action';
      lyricAction.classList.add('custom-song-item-head-action-lyrics');
      lyricAction.dataset.customSongAction = 'lyrics';
      lyricAction.dataset.customSongId = song.id;
      lyricAction.innerHTML = LYRICS_ACTION_ICON;
      lyricAction.title = readSongMessage('lyricsButton');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton'));
      lyricAction.disabled = !song.lyricsText.trim();

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action song-favorite-head-action custom-song-item-head-action';
      chordAction.classList.add('custom-song-item-head-action-chords');
      chordAction.dataset.customSongAction = 'chords';
      chordAction.dataset.customSongId = song.id;
      chordAction.innerHTML = CHORDS_ACTION_ICON;
      chordAction.title = readSongMessage('chordsButton');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton'));
      chordAction.disabled = !song.chordsText.trim();

      headActions.appendChild(lyricAction);
      headActions.appendChild(chordAction);
      head.appendChild(titleNode);
      head.appendChild(headActions);

      const metaNode = document.createElement('p');
      metaNode.className = 'custom-song-item-meta';
      const keyLabel = readSongMessage('customSongKeyLabel');
      const keyValue = song.key || '-';
      const lyricsLabel = readSongMessage('customSongLyricsTab');
      const chordsLabel = readSongMessage('customSongChordsTab');
      const draftLabel = song.isDraft ? readSongMessage('customSongDraftBadge') : '';
      metaNode.textContent = [draftLabel, `${keyLabel}: ${keyValue}`, `${lyricsLabel}: ${song.lyricsText.trim() ? 'OK' : '-'}`, `${chordsLabel}: ${song.chordsText.trim() ? 'OK' : '-'}`]
        .filter(Boolean)
        .join(' | ');

      const updatedNode = document.createElement('p');
      updatedNode.className = 'custom-song-item-updated';
      const updatedAt = formatCustomSongDateTime(song.updatedAtUtc || song.createdAtUtc);
      updatedNode.textContent = updatedAt
        ? `${readSongMessage('customSongUpdatedAt')} (UTC): ${updatedAt}`
        : '';

      const actions = document.createElement('div');
      actions.className = 'custom-song-item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'custom-song-item-action';
      editBtn.dataset.customSongAction = 'edit';
      editBtn.dataset.customSongId = song.id;
      editBtn.textContent = readSongMessage('customSongEditButton');

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-song-item-action';
      removeBtn.dataset.customSongAction = 'remove';
      removeBtn.dataset.customSongId = song.id;
      removeBtn.textContent = readSongMessage('customSongRemoveButton');

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(head);
      item.appendChild(metaNode);
      if (updatedNode.textContent) {
        item.appendChild(updatedNode);
      }
      item.appendChild(actions);
      customSongsList.appendChild(item);
    });
  };

  const closeCustomSongModal = (options = {}) => {
    if (!customSongModal || !customSongModal.classList.contains('open')) return;
    const { preserveDraft = true } = options;

    if (preserveDraft) {
      persistCustomSongDraft(false);
    }
    stopCustomSongDraftAutosave();
    customSongModal.classList.remove('open');
    customSongModal.setAttribute('aria-hidden', 'true');
    customSongEditingId = '';
    setCustomSongDraftStatus('');
    syncBodyModalLock();

    if (!hasAnyOpenModal() && lastFocusedCustomSongTrigger) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(lastFocusedCustomSongTrigger);
      });
    }
    lastFocusedCustomSongTrigger = null;
  };

  const openCustomSongModal = (song = null, trigger = null) => {
    if (!customSongModal) return;
    if (trigger instanceof HTMLElement) {
      lastFocusedCustomSongTrigger = trigger;
    }

    const normalizedSong = song ? normalizeCustomSong(song) : null;
    const storedDraft = readCustomSongDraftFromStorage();
    let draft = null;
    if (normalizedSong) {
      const expectedDraftId = buildCustomSongEditDraftId(normalizedSong.id);
      if (storedDraft && String(storedDraft.id || '').trim() === expectedDraftId) {
        draft = storedDraft;
      }
      customSongEditingId = normalizedSong.id;
    } else {
      if (storedDraft && !String(storedDraft.id || '').trim().startsWith(CUSTOM_SONG_EDIT_DRAFT_PREFIX)) {
        draft = storedDraft;
      }
      customSongEditingId = draft?.id || '';
    }

    if (customSongModalTitle) {
      customSongModalTitle.textContent = customSongEditingId
        ? readSongMessage('customSongEditModalTitle')
        : readSongMessage('customSongModalTitle');
    }
    if (customSongSaveBtn) {
      customSongSaveBtn.textContent = customSongEditingId
        ? readSongMessage('customSongUpdateButton')
        : readSongMessage('customSongSaveButton');
    }

    const formPayload = draft
      ? { ...(normalizedSong || {}), ...draft }
      : (normalizedSong || { tab: CUSTOM_SONG_TAB_LYRICS });
    fillCustomSongForm(formPayload);
    setCustomSongDraftStatus(
      draft
        ? readSongMessage('customSongDraftRecovered')
        : '',
      draft ? 'is-success' : ''
    );

    customSongModal.classList.add('open');
    customSongModal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
    startCustomSongDraftAutosave();
    window.requestAnimationFrame(() => {
      if (customSongTitleInput) {
        focusWithoutScrollingPage(customSongTitleInput);
      }
    });
  };

  const saveCustomSongFromModal = async () => {
    if (!customSongTitleInput) return;
    const payload = collectCustomSongFormData();
    if (!payload.title) {
      setCustomSongDraftStatus(readSongMessage('customSongTitleRequired'), 'is-error');
      showSongToast(readSongMessage('customSongTitleRequired'), 'is-error');
      focusWithoutScrollingPage(customSongTitleInput);
      return;
    }

    const safeEditingId = String(customSongEditingId || '').trim();
    const editingTargetFromDraft = parseCustomSongEditDraftTargetId(safeEditingId);
    const requestSongId = (editingTargetFromDraft || safeEditingId).trim();
    const isUpdatingPersistedSong = Boolean(
      requestSongId
      && !isDraftGeneratedCustomSongId(requestSongId)
    );
    const requestPayload = {
      title: payload.title,
      key: payload.key,
      lyrics_text: payload.lyricsText,
      chords_text: payload.chordsText,
    };

    if (customSongSaveBtn) {
      customSongSaveBtn.disabled = true;
    }

    try {
      if (isUpdatingPersistedSong) {
        await updateCustomSongOnServer(requestSongId, requestPayload);
      } else {
        await createCustomSongOnServer(requestPayload);
      }

      clearCustomSongDraft();
      customSongs = customSongs.filter((song) => !song.isDraft);
      await fetchCustomSongs();

      showSongToast(
        isUpdatingPersistedSong
          ? readSongMessage('customSongUpdateSuccess')
          : readSongMessage('customSongSaveSuccess'),
        'is-success'
      );
      closeCustomSongModal({ preserveDraft: false });
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongSaveError');
      setCustomSongDraftStatus(message, 'is-error');
      showSongToast(message, 'is-error');
    } finally {
      if (customSongSaveBtn) {
        customSongSaveBtn.disabled = false;
      }
    }
  };

  const removeCustomSongById = async (id, triggerElement = null) => {
    const targetId = String(id || '').trim();
    if (!targetId) return;
    const targetSong = getCustomSongById(targetId);
    if (!targetSong) return;

    const safeTitle = targetSong.title || readSongMessage('defaultSongTitle');
    const shouldRemove = await openFavoriteConfirmModal({
      triggerElement,
      songTitle: safeTitle,
      title: readSongMessage('customSongRemoveConfirmTitle'),
      message: readSongMessage('customSongRemoveConfirm', { title: safeTitle }),
      cancelLabel: readSongMessage('customSongRemoveConfirmCancel'),
      acceptLabel: readSongMessage('customSongRemoveConfirmAccept'),
    });
    if (!shouldRemove) return;

    if (targetSong.isDraft) {
      customSongs = customSongs.filter((song) => song.id !== targetId);
      clearCustomSongDraft();
      renderCustomSongs();
      showSongToast(readSongMessage('customSongRemoveSuccess'), 'is-success');
      return;
    }

    try {
      await deleteCustomSongOnServer(targetId);
      await fetchCustomSongs();
      showSongToast(readSongMessage('customSongRemoveSuccess'), 'is-success');
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongRemoveError');
      showSongToast(message, 'is-error');
    }
  };

  const readSortableCustomSongIdsFromDom = () => {
    if (!customSongsList) return [];
    return Array.from(
      customSongsList.querySelectorAll('.custom-song-item[data-custom-song-sortable="true"]')
    )
      .map((item) => String(item.dataset.customSongId || '').trim())
      .filter((id) => /^\d+$/.test(id));
  };

  const persistCustomSongsOrderFromDom = async () => {
    if (customSongsReorderPending) return;
    const orderedIds = readSortableCustomSongIdsFromDom();
    if (!orderedIds.length) return;

    customSongsReorderPending = true;
    try {
      const persistedSongs = await reorderCustomSongsOnServer(orderedIds);
      setPersistedCustomSongs(persistedSongs);
      syncStoredCustomDraftToSongList();
      renderCustomSongs();
      showSongToast(readSongMessage('customSongsReorderSuccess'), 'is-success');
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongsReorderError');
      showSongToast(message, 'is-error');
      await fetchCustomSongs();
    } finally {
      customSongsReorderPending = false;
    }
  };

  customSongs = [];
  syncStoredCustomDraftToSongList();
  renderCustomSongs();
  runDeferredTask(fetchCustomSongs, 650);

  if (customSongsAddBtn) {
    customSongsAddBtn.addEventListener('click', () => {
      if (!ensureLoggedInForUserScopedAction({
        message: 'Faça login para adicionar musica personalizada.',
        trigger: customSongsAddBtn,
        notify: true,
      })) {
        return;
      }
      openCustomSongModal(null, customSongsAddBtn);
    });
  }

  if (customSongTabLyricsBtn) {
    customSongTabLyricsBtn.addEventListener('click', () => {
      setCustomSongTab(CUSTOM_SONG_TAB_LYRICS);
    });
  }

  if (customSongTabChordsBtn) {
    customSongTabChordsBtn.addEventListener('click', () => {
      setCustomSongTab(CUSTOM_SONG_TAB_CHORDS);
    });
  }

  if (customSongSaveBtn) {
    customSongSaveBtn.addEventListener('click', saveCustomSongFromModal);
  }

  if (customSongsList) {
    customSongsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionButton = target.closest('[data-custom-song-action]');
      if (!(actionButton instanceof HTMLElement)) return;
      const action = String(actionButton.dataset.customSongAction || '').trim();
      const songId = String(actionButton.dataset.customSongId || '').trim();
      if (!songId) return;

      if (action === 'edit') {
        const song = getCustomSongById(songId);
        if (song) {
          openCustomSongModal(song, actionButton);
        }
        return;
      }

      if (action === 'lyrics' || action === 'chords') {
        const song = getCustomSongById(songId);
        if (song) {
          openCustomSongCached(song, action, actionButton);
        }
        return;
      }

      if (action === 'remove') {
        removeCustomSongById(songId, actionButton);
      }
    });

    customSongsList.addEventListener('dragstart', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button, select, input, textarea, a, [contenteditable="true"]')) return;

      const item = target.closest('.custom-song-item[data-custom-song-sortable="true"]');
      if (!(item instanceof HTMLElement)) return;

      const songId = String(item.dataset.customSongId || '').trim();
      if (!/^\d+$/.test(songId)) return;

      customSongDragId = songId;
      customSongDragStartOrder = readSortableCustomSongIdsFromDom();
      item.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
        event.dataTransfer.setData('text/plain', songId);
      }
    });

    customSongsList.addEventListener('dragenter', (event) => {
      if (customSongDragId) {
        event.preventDefault();
      }
    });

    customSongsList.addEventListener('dragover', (event) => {
      if (!customSongDragId) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const targetItem = target.closest('.custom-song-item[data-custom-song-sortable="true"]');
      if (!(targetItem instanceof HTMLElement)) return;

      const draggedItem = customSongsList.querySelector(`.custom-song-item[data-custom-song-id="${customSongDragId}"]`);
      if (!(draggedItem instanceof HTMLElement) || draggedItem === targetItem) return;

      event.preventDefault();
      const sortableItems = Array.from(
        customSongsList.querySelectorAll('.custom-song-item[data-custom-song-sortable="true"]')
      );
      const dragIndex = sortableItems.indexOf(draggedItem);
      const targetIndex = sortableItems.indexOf(targetItem);
      if (dragIndex < 0 || targetIndex < 0) return;

      if (dragIndex < targetIndex) {
        customSongsList.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        customSongsList.insertBefore(draggedItem, targetItem);
      }
    });

    customSongsList.addEventListener('drop', (event) => {
      if (customSongDragId) {
        event.preventDefault();
      }
    });

    customSongsList.addEventListener('dragend', () => {
      customSongsList
        .querySelectorAll('.custom-song-item.is-dragging')
        .forEach((item) => item.classList.remove('is-dragging'));

      if (!customSongDragId) return;
      const finalOrder = readSortableCustomSongIdsFromDom();
      const initialOrder = [...customSongDragStartOrder];
      customSongDragId = '';
      customSongDragStartOrder = [];

      const hasChanged = finalOrder.length !== initialOrder.length
        || finalOrder.some((id, index) => id !== initialOrder[index]);
      if (!hasChanged) return;

      persistCustomSongsOrderFromDom();
    });
  }

  if (customSongModalCloseButtons.length) {
    customSongModalCloseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        closeCustomSongModal({ preserveDraft: true });
      });
    });
  }

  const hasWrappedSongTitle = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const content = String(element.textContent || '').trim();
    if (!content) return false;

    const range = document.createRange();
    range.selectNodeContents(element);
    const textRects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));

    if (!textRects.length) {
      const styles = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(styles.lineHeight || '');
      if (Number.isFinite(lineHeight) && lineHeight > 0) {
        return element.scrollHeight > (lineHeight * 1.35);
      }
      return false;
    }

    let lineCount = 0;
    let lastTop = null;
    textRects.forEach((rect) => {
      if (lastTop === null || Math.abs(rect.top - lastTop) > 1.5) {
        lineCount += 1;
        lastTop = rect.top;
      }
    });
    return lineCount > 1;
  };

  const syncSongSearchResultItemLayout = (item) => {
    if (!(item instanceof HTMLElement)) return;
    const titleNode = item.querySelector('.song-search-info strong');
    const isWrapped = hasWrappedSongTitle(titleNode);
    item.classList.toggle('is-title-wrapped', isWrapped);
  };

  const syncSongFavoriteItemLayout = (item) => {
    if (!(item instanceof HTMLElement)) return;
    const titleNode = item.querySelector('.song-favorite-head .booklet-cantos-title');
    const isWrapped = hasWrappedSongTitle(titleNode);
    item.classList.toggle('is-title-wrapped', isWrapped);
  };

  const syncSongSearchResultsLayout = (targetWidget = null) => {
    if (!songSearchWidgets.length) return;
    const targetWidgets = targetWidget ? [targetWidget] : songSearchWidgets;
    targetWidgets.forEach((widget) => {
      widget.resultsList.querySelectorAll('.song-search-item').forEach((item) => {
        syncSongSearchResultItemLayout(item);
      });
    });
  };

  const syncSongFavoritesScrollClamp = () => {
    if (!songFavoritesList) return;

    songFavoritesList.style.maxHeight = '';
    songFavoritesList.classList.remove('is-scrollable');

    const favoriteItems = Array.from(songFavoritesList.querySelectorAll('.song-favorite-item'))
      .filter((item) => !item.classList.contains('song-favorites-empty'));
    if (!favoriteItems.length) return;

    const maxVisibleRows = window.innerWidth <= SONG_FAVORITES_SCROLL_MOBILE_BREAKPOINT
      ? SONG_FAVORITES_SCROLL_ROWS_MOBILE
      : SONG_FAVORITES_SCROLL_ROWS_DESKTOP;
    if (!Number.isFinite(maxVisibleRows) || maxVisibleRows <= 0) return;

    const rowHeights = [];
    let currentRowTop = null;
    let currentRowHeight = 0;

    favoriteItems.forEach((item) => {
      const itemTop = item.offsetTop;
      const itemHeight = item.offsetHeight;
      if (!Number.isFinite(itemTop) || !Number.isFinite(itemHeight) || itemHeight <= 0) return;

      if (currentRowTop === null || Math.abs(itemTop - currentRowTop) > 2) {
        if (currentRowTop !== null) {
          rowHeights.push(currentRowHeight);
        }
        currentRowTop = itemTop;
        currentRowHeight = itemHeight;
        return;
      }

      currentRowHeight = Math.max(currentRowHeight, itemHeight);
    });

    if (currentRowTop !== null) {
      rowHeights.push(currentRowHeight);
    }
    if (rowHeights.length <= maxVisibleRows) return;

    const styles = window.getComputedStyle(songFavoritesList);
    const parsedRowGap = Number.parseFloat(styles.rowGap || styles.gap || '0');
    const rowGap = Number.isFinite(parsedRowGap) ? parsedRowGap : 0;
    const totalRowsHeight = rowHeights
      .slice(0, maxVisibleRows)
      .reduce((total, rowHeight) => total + rowHeight, 0);
    const maxHeight = totalRowsHeight + (rowGap * Math.max(0, maxVisibleRows - 1));
    if (!Number.isFinite(maxHeight) || maxHeight <= 0) return;

    songFavoritesList.style.maxHeight = `${Math.ceil(maxHeight)}px`;
    songFavoritesList.classList.add('is-scrollable');
  };

  const syncSongFavoritesLayout = () => {
    if (!songFavoritesList) return;
    songFavoritesList.querySelectorAll('.song-favorite-item').forEach((item) => {
      syncSongFavoriteItemLayout(item);
    });
    syncSongFavoritesScrollClamp();
  };

  let songSearchLayoutFrame = null;
  const scheduleSongSearchResultsLayoutSync = (targetWidget = null) => {
    if (songSearchLayoutFrame !== null) return;
    songSearchLayoutFrame = window.requestAnimationFrame(() => {
      songSearchLayoutFrame = null;
      syncSongSearchResultsLayout(targetWidget);
      window.requestAnimationFrame(() => {
        syncSongSearchResultsLayout(targetWidget);
      });
      window.setTimeout(() => {
        syncSongSearchResultsLayout(targetWidget);
      }, 120);
    });
  };

  let songFavoritesLayoutFrame = null;
  const scheduleSongFavoritesLayoutSync = () => {
    if (songFavoritesLayoutFrame !== null) return;
    songFavoritesLayoutFrame = window.requestAnimationFrame(() => {
      songFavoritesLayoutFrame = null;
      syncSongFavoritesLayout();
      window.requestAnimationFrame(() => {
        syncSongFavoritesLayout();
      });
      window.setTimeout(() => {
        syncSongFavoritesLayout();
      }, 120);
    });
  };

  const renderSongSearchResults = (results, options = {}) => {
    const { targetWidget = null, append = false, hasMore = false } = options;
    if (!songSearchWidgets.length) return;

    const activeWidget = resolveSongSearchWidget(targetWidget);

    if (!activeWidget) return;

    if (!append) {
      activeWidget.resultsList.innerHTML = '';
      activeWidget.resultsContainer.scrollTop = 0;
    }

    const identitySeen = append
      ? readSongSearchIdentitySeenFromRenderedList(activeWidget.resultsList)
      : createSongSearchIdentitySeen();
    const safeResults = dedupeSongSearchResultsByIdentity(results, identitySeen);
    if (!safeResults.length) {
      if (!append) {
        activeWidget.resultsContainer.hidden = true;
        hideSongSearchResultsExcept(activeWidget);
      }
      updateSongSearchLoadMoreButton(activeWidget, {
        hasMore,
        loading: false
      });
      return;
    }

    safeResults.forEach((result) => {
      const songIdentity = readSongIdentityForMatch(result);
      const item = document.createElement('li');
      item.className = 'song-search-item';
      item.dataset.songUrlKey = String(songIdentity.urlKey || '').trim();
      item.dataset.songTitleArtistKey = String(songIdentity.titleArtistKey || '').trim();
      item.dataset.songTitleKey = String(songIdentity.titleKey || '').trim();

      const main = document.createElement('div');
      main.className = 'song-search-main';

      const avatar = document.createElement('img');
      avatar.className = 'song-search-avatar';
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
      avatar.alt = result.artist
        ? readSongMessage('avatarAltWithArtist', { artist: result.artist })
        : readSongMessage('avatarAltFallback');
      avatar.src = (result.image_url || '').trim() || songSearchFallbackImage;
      avatar.addEventListener('error', () => {
        avatar.src = songSearchFallbackImage;
      });

      const info = document.createElement('div');
      info.className = 'song-search-info';
      const title = document.createElement('strong');
      title.textContent = result.title || readSongMessage('defaultSongTitle');
      const meta = document.createElement('p');
      const artist = (result.artist || '').trim();
      const sourceLabel = resolveSongSourceLabel(result.source, result.source_label || '');
      const singerPrefix = readSongMessage('singerPrefix');
      const sourcePrefix = readSongMessage('sourcePrefix');
      meta.textContent = artist
        ? `${singerPrefix} ${artist} | ${sourcePrefix} ${sourceLabel}`
        : `${sourcePrefix} ${sourceLabel}`;
      info.appendChild(title);
      info.appendChild(meta);
      main.appendChild(avatar);
      main.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'song-search-actions';
      const externalQuery = buildExternalSongSearchQuery(result);
      const urlKey = normalizeSongUrlKey(result.url);

      const favoriteAction = document.createElement('button');
      favoriteAction.type = 'button';
      favoriteAction.className = 'song-search-action song-search-action-favorite';
      favoriteAction.dataset.songUrlKey = urlKey;
      setFavoriteButtonState(favoriteAction, Boolean(urlKey && songFavoritesByUrl.has(urlKey)), false);
      favoriteAction.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveSongFavorite(result, favoriteAction, activeWidget);
      });

      const assignMysteryAction = document.createElement('button');
      assignMysteryAction.type = 'button';
      assignMysteryAction.className = 'song-search-action song-search-action-assign-mystery song-open-save-location-trigger';
      assignMysteryAction.innerHTML = SONG_ASSIGN_PLUS_ICON;
      assignMysteryAction.title = readMysteryMessage('assignButtonTitle');
      assignMysteryAction.setAttribute(
        'aria-label',
        readMysteryMessage('assignButtonAria')
      );
      assignMysteryAction.disabled = !((result.title || '').trim() || (result.url || '').trim());
      assignMysteryAction.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const hasPointerPosition = (
          event instanceof MouseEvent
          && event.detail > 0
          && Number.isFinite(event.clientX)
          && Number.isFinite(event.clientY)
        );
        const openOptions = hasPointerPosition
          ? { clientX: event.clientX, clientY: event.clientY }
          : null;
        void openSongSaveLocationPicker(result, assignMysteryAction, openOptions);
      });

      const spotifyAction = document.createElement('a');
      spotifyAction.className = 'song-search-action song-search-action-external';
      spotifyAction.classList.add('song-search-action-spotify');
      spotifyAction.innerHTML = SPOTIFY_ACTION_ICON;
      spotifyAction.title = readSongMessage('spotifyTitle');
      spotifyAction.setAttribute('aria-label', readSongMessage('spotifyAria'));
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
      youtubeAction.classList.add('song-search-action-youtube');
      youtubeAction.innerHTML = YOUTUBE_ACTION_ICON;
      youtubeAction.title = readSongMessage('youtubeTitle');
      youtubeAction.setAttribute('aria-label', readSongMessage('youtubeAria'));
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
      lyricAction.classList.add('song-search-action-lyrics');
      lyricAction.innerHTML = LYRICS_ACTION_ICON;
      lyricAction.title = readSongMessage('lyricsButton');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton'));
      lyricAction.disabled = !result.title && !result.url;
      lyricAction.addEventListener('click', () => {
        const cachedFavorite = urlKey ? songFavoritesByUrl.get(urlKey) : null;
        if (cachedFavorite) {
          openSongFavoriteCached(cachedFavorite, 'lyrics', lyricAction);
          return;
        }
        loadLyricsFromService(result, lyricAction);
      });

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action';
      chordAction.classList.add('song-search-action-chords');
      chordAction.innerHTML = CHORDS_ACTION_ICON;
      chordAction.title = readSongMessage('chordsButton');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton'));
      chordAction.disabled = !result.url;
      chordAction.addEventListener('click', () => {
        const cachedFavorite = urlKey ? songFavoritesByUrl.get(urlKey) : null;
        if (cachedFavorite) {
          openSongFavoriteCached(cachedFavorite, 'chords', chordAction);
          return;
        }
        loadSongFromUrl(result.url || '', chordAction, result);
      });

      actions.appendChild(spotifyAction);
      actions.appendChild(youtubeAction);
      actions.appendChild(lyricAction);
      actions.appendChild(chordAction);
      actions.appendChild(favoriteAction);
      actions.appendChild(assignMysteryAction);

      item.appendChild(main);
      item.appendChild(actions);
      activeWidget.resultsList.appendChild(item);
    });

    activeWidget.resultsContainer.hidden = false;
    hideSongSearchResultsExcept(activeWidget);
    updateSongSearchLoadMoreButton(activeWidget, {
      hasMore,
      loading: false
    });
    scheduleSongSearchResultsLayoutSync(activeWidget);
    window.requestAnimationFrame(() => {
      maybeAutoLoadMoreSongSearch(activeWidget);
    });
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
        const targetRoot = canonicalNote(tone);
        if (!targetRoot) return;

        songState.semitones = calculateSongToneSemitonesToRoot(targetRoot);
        renderFetchedSong();
        persistCurrentSongTonePreference();
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
      persistCurrentSongTonePreference();
    });
  }

  const SONG_SEARCH_MIN_CHARS = 2;
  const SONG_SEARCH_DEBOUNCE_MS = 320;
  let songSearchDebounceId = null;
  let songSearchAbortController = null;
  let songSearchRequestId = 0;

  const normalizeSongSearchQuery = (value) => (value || '').trim().toLowerCase();
  const readSongSearchResponsePage = (payload, fallbackPage = 1) => {
    const parsed = Number.parseInt(String(payload?.page ?? fallbackPage), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackPage;
  };
  const readSongSearchResponsePageSize = (payload, fallbackPageSize = SONG_SEARCH_DEFAULT_PAGE_SIZE) => (
    normalizeSongSearchPageSize(payload?.page_size ?? payload?.limit ?? fallbackPageSize)
  );
  const readSongSearchResponseHasMore = (payload, fallback = false) => {
    if (typeof payload?.has_more === 'boolean') return payload.has_more;
    return Boolean(fallback);
  };
  const createSongSearchIdentitySeen = () => ({
    byUrl: new Set(),
    byTitleArtist: new Set(),
    byTitle: new Set()
  });
  const markSongSearchIdentitySeen = (seen, identityPayload) => {
    const safeSeen = asObject(seen);
    const identity = asObject(identityPayload);
    if (safeSeen.byUrl instanceof Set) {
      const urlKey = String(identity.urlKey || '').trim();
      if (urlKey) safeSeen.byUrl.add(urlKey);
    }
    if (safeSeen.byTitleArtist instanceof Set) {
      const titleArtistKey = String(identity.titleArtistKey || '').trim();
      if (titleArtistKey) safeSeen.byTitleArtist.add(titleArtistKey);
    }
    if (safeSeen.byTitle instanceof Set) {
      const titleKey = String(identity.titleKey || '').trim();
      if (titleKey) safeSeen.byTitle.add(titleKey);
    }
  };
  const isSongSearchIdentitySeen = (seen, identityPayload) => {
    const safeSeen = asObject(seen);
    const identity = asObject(identityPayload);
    const urlKey = String(identity.urlKey || '').trim();
    if (urlKey && safeSeen.byUrl instanceof Set && safeSeen.byUrl.has(urlKey)) return true;
    const titleArtistKey = String(identity.titleArtistKey || '').trim();
    if (titleArtistKey && safeSeen.byTitleArtist instanceof Set && safeSeen.byTitleArtist.has(titleArtistKey)) return true;
    const titleKey = String(identity.titleKey || '').trim();
    return Boolean(titleKey && safeSeen.byTitle instanceof Set && safeSeen.byTitle.has(titleKey));
  };
  const dedupeSongSearchResultsByIdentity = (results, initialSeen = null) => {
    const safeResults = Array.isArray(results) ? results : [];
    if (!safeResults.length) return [];

    const seen = (
      initialSeen
      && initialSeen.byUrl instanceof Set
      && initialSeen.byTitleArtist instanceof Set
      && initialSeen.byTitle instanceof Set
    )
      ? initialSeen
      : createSongSearchIdentitySeen();
    const deduped = [];

    safeResults.forEach((rawResult) => {
      const result = asObject(rawResult);
      const identity = readSongIdentityForMatch(result);
      if (isSongSearchIdentitySeen(seen, identity)) return;
      markSongSearchIdentitySeen(seen, identity);
      deduped.push(result);
    });

    return deduped;
  };
  const readSongSearchIdentitySeenFromRenderedList = (resultsListNode) => {
    const seen = createSongSearchIdentitySeen();
    if (!(resultsListNode instanceof Element)) return seen;

    resultsListNode.querySelectorAll('.song-search-item').forEach((itemNode) => {
      if (!(itemNode instanceof HTMLElement)) return;
      markSongSearchIdentitySeen(seen, {
        urlKey: String(itemNode.dataset.songUrlKey || '').trim(),
        titleArtistKey: String(itemNode.dataset.songTitleArtistKey || '').trim(),
        titleKey: String(itemNode.dataset.songTitleKey || '').trim(),
      });
    });

    return seen;
  };
  const prioritizeKnownSongResults = (results) => {
    const safeResults = Array.isArray(results) ? results : [];
    if (safeResults.length < 2) return safeResults.slice();

    const scored = safeResults.map((result, index) => {
      const safeResult = asObject(result);
      const urlKey = normalizeSongUrlKey(safeResult.url || safeResult.song_url || '');
      const isFavorite = Boolean(urlKey && songFavoritesByUrl.has(urlKey));
      const hasUsage = hasSongMysteryUsage(safeResult);
      const score = (isFavorite ? 2 : 0) + (hasUsage ? 1 : 0);
      return {
        result,
        index,
        score,
      };
    });

    scored.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

    return scored.map((entry) => entry.result);
  };

  const executeSongSearch = async (rawQuery, options = {}) => {
    const {
      fromTyping = false,
      fromLoadMore = false,
      widget = null,
      page = 1,
      append = false
    } = options;
    const activeWidget = resolveSongSearchWidget(widget);
    if (!activeWidget) return;
    const searchState = readSongSearchWidgetState(activeWidget);
    if (!searchState) return;

    const query = (rawQuery || '').trim();
    const normalizedQuery = normalizeSongSearchQuery(query);
    const requestedPage = normalizeSongSearchPage(page);

    if (!query) {
      if (songSearchAbortController) {
        songSearchAbortController.abort();
      }
      songSearchRequestId += 1;
      songSearchAbortController = null;
      clearSongSearchResults();
      resetSongSearchWidgetState();
      setSongFeedback('');
      if (!fromTyping && !fromLoadMore) {
        setFetchSubmitState(false, readSongMessage('searchButton'));
      }
      return;
    }

    if (query.length < SONG_SEARCH_MIN_CHARS) {
      if (songSearchAbortController) {
        songSearchAbortController.abort();
      }
      songSearchRequestId += 1;
      songSearchAbortController = null;
      clearSongSearchResults(activeWidget);
      hideSongSearchResultsExcept(activeWidget);
      setSongFeedback(
        readSongMessage('searchMinChars', { count: SONG_SEARCH_MIN_CHARS }),
        '',
        activeWidget
      );
      resetSongSearchWidgetState(activeWidget);
      if (!fromTyping && !fromLoadMore) {
        setFetchSubmitState(false, readSongMessage('searchButton'));
      }
      return;
    }

    const sameQueryAsCurrent = searchState.normalizedQuery === normalizedQuery;
    const isLoadMoreRequest = Boolean(append && requestedPage > 1 && sameQueryAsCurrent);
    if (!isLoadMoreRequest) {
      searchState.page = 0;
      searchState.hasMore = false;
      searchState.loadingMore = false;
    }
    searchState.query = query;
    searchState.normalizedQuery = normalizedQuery;

    const cachedEntry = readSongSearchCacheEntry(normalizedQuery);
    const cachedPageResults = cachedEntry?.pages.get(requestedPage);
    if (Array.isArray(cachedPageResults)) {
      const cacheHasMore = Boolean(cachedEntry?.hasMore);
      const shouldHydrateCachedPages = Boolean(!isLoadMoreRequest && requestedPage === 1);
      let renderResults = prioritizeKnownSongResults(cachedPageResults);
      let renderAppend = requestedPage > 1;
      let resolvedPage = requestedPage;

      if (shouldHydrateCachedPages && cachedEntry?.pages instanceof Map) {
        const hydratedPages = [];
        const knownPages = Array.from(cachedEntry.pages.keys())
          .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
          .sort((a, b) => a - b);

        let expectedPage = 1;
        knownPages.forEach((pageNumber) => {
          if (pageNumber !== expectedPage) return;
          const pageResults = cachedEntry.pages.get(pageNumber);
          if (!Array.isArray(pageResults)) return;
          hydratedPages.push(pageNumber);
          expectedPage += 1;
        });

        if (hydratedPages.length) {
          renderResults = [];
          hydratedPages.forEach((pageNumber) => {
            const pageResults = cachedEntry.pages.get(pageNumber);
            if (Array.isArray(pageResults) && pageResults.length) {
              renderResults.push(...pageResults);
            }
          });
          renderResults = prioritizeKnownSongResults(renderResults);
          resolvedPage = hydratedPages[hydratedPages.length - 1];
          renderAppend = false;
        }
      }

      const loadedCount = countSongSearchCachedResults(cachedEntry, resolvedPage);
      if (!renderResults.length && requestedPage === 1) {
        clearSongSearchResults(activeWidget);
        hideSongSearchResultsExcept(activeWidget);
        setSongFeedback(readSongMessage('searchNoResults'), '', activeWidget);
        searchState.page = 0;
        searchState.hasMore = false;
      } else {
        renderSongSearchResults(renderResults, {
          targetWidget: activeWidget,
          append: renderAppend,
          hasMore: cacheHasMore
        });
        searchState.page = resolvedPage;
        searchState.hasMore = cacheHasMore;
        const foundMessage = readSongMessage('searchResultsFound', { count: loadedCount });
        setSongFeedback(foundMessage, 'is-success', activeWidget);
        if (cacheHasMore) {
          window.requestAnimationFrame(() => {
            maybeAutoLoadMoreSongSearch(activeWidget);
          });
        }
      }
      if (!fromTyping && !fromLoadMore) {
        setFetchSubmitState(false, readSongMessage('searchButton'));
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

    if (!fromTyping && !fromLoadMore) {
      setFetchSubmitState(true, readSongMessage('searchButtonLoading'));
    }
    if (isLoadMoreRequest) {
      updateSongSearchLoadMoreButton(activeWidget, {
        visible: true,
        hasMore: true,
        loading: true
      });
      setSongFeedback(readSongMessage('searchLoadingMore'), 'is-loading', activeWidget);
    } else {
      setSongFeedback(readSongMessage('searchingSources'), 'is-loading', activeWidget);
      hideSongSearchResultsExcept(activeWidget);
    }

    try {
      const response = await fetch('/api/songs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          page: requestedPage,
          page_size: SONG_SEARCH_DEFAULT_PAGE_SIZE,
          limit: SONG_SEARCH_DEFAULT_PAGE_SIZE
        }),
        signal: songSearchAbortController ? songSearchAbortController.signal : undefined
      });

      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || readSongMessage('searchErrorApi');
        throw new Error(message);
      }

      // Ignore stale responses when the user keeps typing.
      if (requestId !== songSearchRequestId) {
        return;
      }

      const responsePage = readSongSearchResponsePage(payload, requestedPage);
      const responsePageSize = readSongSearchResponsePageSize(payload, SONG_SEARCH_DEFAULT_PAGE_SIZE);
      const responseHasMore = readSongSearchResponseHasMore(payload, false);
      const rawResults = Array.isArray(payload.results) ? payload.results : [];
      const results = prioritizeKnownSongResults(rawResults);

      const cacheEntry = getOrCreateSongSearchCacheEntry(normalizedQuery, query);
      if (cacheEntry) {
        cacheEntry.pageSize = responsePageSize;
        cacheEntry.hasMore = responseHasMore;
        cacheEntry.pages.set(responsePage, results);
        const payloadTotal = Number.parseInt(String(payload?.total ?? ''), 10);
        cacheEntry.total = Number.isInteger(payloadTotal) && payloadTotal >= 0
          ? payloadTotal
          : countSongSearchCachedResults(cacheEntry);
      }

      if (!results.length && responsePage === 1) {
        clearSongSearchResults(activeWidget);
        hideSongSearchResultsExcept(activeWidget);
        setSongFeedback(readSongMessage('searchNoResults'), '', activeWidget);
        searchState.page = 0;
        searchState.hasMore = false;
        searchState.loadingMore = false;
        return;
      }

      if (!results.length && responsePage > 1) {
        searchState.hasMore = false;
        searchState.loadingMore = false;
        updateSongSearchLoadMoreButton(activeWidget, {
          hasMore: false,
          loading: false
        });
        setSongFeedback(readSongMessage('searchNoMoreResults'), '', activeWidget);
        return;
      }

      renderSongSearchResults(results, {
        targetWidget: activeWidget,
        append: responsePage > 1,
        hasMore: responseHasMore
      });

      searchState.page = responsePage;
      searchState.hasMore = responseHasMore;
      searchState.loadingMore = false;
      const updatedCacheEntry = readSongSearchCacheEntry(normalizedQuery);
      const loadedCount = updatedCacheEntry
        ? countSongSearchCachedResults(updatedCacheEntry, responsePage)
        : results.length;
      const foundMessage = readSongMessage('searchResultsFound', { count: loadedCount });
      setSongFeedback(foundMessage, 'is-success', activeWidget);
    } catch (err) {
      if (err && typeof err === 'object' && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : readSongMessage('searchError');
      searchState.loadingMore = false;
      updateSongSearchLoadMoreButton(activeWidget, {
        hasMore: searchState.hasMore,
        loading: false
      });
      setSongFeedback(message, 'is-error', activeWidget);
    } finally {
      if (requestId === songSearchRequestId) {
        songSearchAbortController = null;
      }
      if (!fromTyping && !fromLoadMore) {
        setFetchSubmitState(false, readSongMessage('searchButton'));
      }
    }
  };

  const clearSongSearchState = (focusInput = null) => {
    if (!songSearchWidgets.length) return;
    songSearchWidgets.forEach((widget) => {
      widget.input.value = '';
    });
    clearSongSearchResults();
    resetSongSearchWidgetState();
    setSongFeedback('');
    syncSongSearchClearButtons();
    if (focusInput) {
      focusInput.focus();
    }
  };

  if (songFavoritesSearchInput) {
    songFavoritesSearchInput.addEventListener('input', () => {
      songFavoritesSearchQuery = String(songFavoritesSearchInput.value || '');
      renderSongFavorites();
    });
    songFavoritesSearchInput.addEventListener('search', () => {
      songFavoritesSearchQuery = String(songFavoritesSearchInput.value || '');
      renderSongFavorites();
    });
  }

  if (songFavoritesList) {
    songFavoritesList.addEventListener('wheel', (event) => {
      // Keep wheel scrolling inside the favorites panel and avoid portal section navigation.
      event.stopPropagation();
    }, { passive: true });

    songFavoritesList.addEventListener('dragstart', (event) => {
      if (songFavoritesReorderPending) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button, select, input, textarea, a, [contenteditable="true"]')) return;

      const item = target.closest('.song-favorite-item[data-song-favorite-sortable="true"]');
      if (!(item instanceof HTMLElement)) return;

      const favoriteId = Number.parseInt(String(item.dataset.songFavoriteId || '').trim(), 10);
      if (!Number.isInteger(favoriteId) || favoriteId <= 0) return;

      songFavoritesDragId = String(favoriteId);
      songFavoritesDragStartOrder = readSortableSongFavoriteIdsFromDom().map(String);
      item.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
        event.dataTransfer.setData('text/plain', songFavoritesDragId);
      }
    });

    songFavoritesList.addEventListener('dragenter', (event) => {
      if (songFavoritesDragId) {
        event.preventDefault();
      }
    });

    songFavoritesList.addEventListener('dragover', (event) => {
      if (!songFavoritesDragId || songFavoritesReorderPending) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const targetItem = target.closest('.song-favorite-item[data-song-favorite-sortable="true"]');
      if (!(targetItem instanceof HTMLElement)) return;

      const draggedItem = songFavoritesList.querySelector(`.song-favorite-item[data-song-favorite-id="${songFavoritesDragId}"]`);
      if (!(draggedItem instanceof HTMLElement) || draggedItem === targetItem) return;

      event.preventDefault();
      const sortableItems = Array.from(
        songFavoritesList.querySelectorAll('.song-favorite-item[data-song-favorite-sortable="true"]')
      );
      const dragIndex = sortableItems.indexOf(draggedItem);
      const targetIndex = sortableItems.indexOf(targetItem);
      if (dragIndex < 0 || targetIndex < 0) return;

      if (dragIndex < targetIndex) {
        songFavoritesList.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        songFavoritesList.insertBefore(draggedItem, targetItem);
      }
    });

    songFavoritesList.addEventListener('drop', (event) => {
      if (songFavoritesDragId) {
        event.preventDefault();
      }
    });

    songFavoritesList.addEventListener('dragend', () => {
      songFavoritesList
        .querySelectorAll('.song-favorite-item.is-dragging')
        .forEach((item) => item.classList.remove('is-dragging'));

      if (!songFavoritesDragId) return;
      const finalOrder = readSortableSongFavoriteIdsFromDom().map(String);
      const initialOrder = [...songFavoritesDragStartOrder];
      songFavoritesDragId = '';
      songFavoritesDragStartOrder = [];

      const hasChanged = finalOrder.length !== initialOrder.length
        || finalOrder.some((id, index) => id !== initialOrder[index]);
      if (!hasChanged) return;

      persistSongFavoritesOrderFromDom();
    });
  }

  runDeferredTask(fetchSongFavorites, 350);
  runDeferredTask(fetchMysterySongAssignments, 470);
  runDeferredTask(fetchSongLocationTree, 420);
  runDeferredTask(fetchSongLocationAssignments, 520);

  if (songSearchWidgets.length) {
    window.addEventListener('resize', () => {
      scheduleSongSearchResultsLayoutSync();
      scheduleSongFavoritesLayoutSync();
      positionSongSaveLocationPicker();
    }, { passive: true });
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => {
        scheduleSongSearchResultsLayoutSync();
        scheduleSongFavoritesLayoutSync();
      }).catch(() => {});
    }
    window.addEventListener('scroll', () => {
      positionSongSaveLocationPicker();
    }, { passive: true });

    syncSongSearchClearButtons();
    const resolveSongSearchExecutionWidget = (sourceWidget = null) => {
      if (!sourceWidget) return resolveSongSearchWidget();
      if (sourceWidget.id !== 'cantos') return sourceWidget;
      return songSearchWidgets.find((widget) => widget.id === 'header') || sourceWidget;
    };

    songSearchWidgets.forEach((widget) => {
      widget.resultsContainer.addEventListener('wheel', (event) => {
        // Keep wheel scrolling inside the results panel and avoid portal section navigation.
        event.stopPropagation();
      }, { passive: true });
      widget.resultsContainer.addEventListener('scroll', () => {
        maybeAutoLoadMoreSongSearch(widget);
        positionSongSaveLocationPicker();
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
          resetSongSearchWidgetState();
          setSongFeedback('');
          if (songSearchAbortController) {
            songSearchAbortController.abort();
          }
          songSearchRequestId += 1;
          songSearchAbortController = null;
          return;
        }

        songSearchDebounceId = window.setTimeout(() => {
          const executionWidget = resolveSongSearchExecutionWidget(widget);
          executeSongSearch(query, { fromTyping: true, widget: executionWidget });
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
          const executionWidget = resolveSongSearchExecutionWidget(widget);
          await executeSongSearch(widget.input.value, { fromTyping: false, widget: executionWidget });
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
        const executionWidget = resolveSongSearchExecutionWidget(widget);
        await executeSongSearch(widget.input.value, { fromTyping: false, widget: executionWidget });
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const targetElement = target instanceof Element ? target : null;
      const eventPath = typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];
      const eventPathIncludes = (node) => Array.isArray(eventPath) && eventPath.includes(node);
      const bookletSearchButton = targetElement
        ? targetElement.closest('.booklet-cantos-search-btn')
        : null;
      if (bookletSearchButton instanceof HTMLElement) {
        const query = (bookletSearchButton.dataset.bookletSongQuery || '').trim();
        if (!query) return;
        const cantosWidget = songSearchWidgets.find((widget) => widget.id === 'cantos')
          || resolveSongSearchWidget();
        if (!cantosWidget || !cantosWidget.input) return;

        cantosWidget.input.value = query;
        syncSongSearchInputs(cantosWidget.input);
        syncSongSearchClearButtons();
        const executionWidget = resolveSongSearchExecutionWidget(cantosWidget);
        void executeSongSearch(query, { fromTyping: false, widget: executionWidget });
        return;
      }
      const clickedInsideSongLocationCreateModal = Boolean(
        songLocationCreateModal
        && (
          (targetElement && targetElement.closest('#song-location-create-modal'))
          || eventPathIncludes(songLocationCreateModal)
        )
      );
      if (clickedInsideSongLocationCreateModal) return;
      const clickedInsideFavoriteConfirmModalPre = Boolean(
        favoriteConfirmModal
        && (
          (targetElement && targetElement.closest('#favorite-confirm-modal'))
          || eventPathIncludes(favoriteConfirmModal)
        )
      );
      if (clickedInsideFavoriteConfirmModalPre) return;
      const clickedInsideCustomSongModalPre = Boolean(
        customSongModal
        && (
          (targetElement && targetElement.closest('#custom-song-modal'))
          || eventPathIncludes(customSongModal)
        )
      );
      if (clickedInsideCustomSongModalPre) return;
      const clickedInsideMysterySongAssignModalPre = Boolean(
        mysterySongAssignModal
        && (
          (targetElement && targetElement.closest('#mystery-song-assign-modal'))
          || eventPathIncludes(mysterySongAssignModal)
        )
      );
      if (clickedInsideMysterySongAssignModalPre) return;
      const clickedInsideAuthModalPre = Boolean(
        authModal
        && (
          (targetElement && targetElement.closest('#auth-modal'))
          || eventPathIncludes(authModal)
        )
      );
      if (clickedInsideAuthModalPre) return;
      const clickedInsideAuthSessionsModalPre = Boolean(
        authSessionsModal
        && (
          (targetElement && targetElement.closest('#auth-sessions-modal'))
          || eventPathIncludes(authSessionsModal)
        )
      );
      if (clickedInsideAuthSessionsModalPre) return;
      const clickedInsideSongShareModalPre = Boolean(
        songShareModal
        && (
          (targetElement && targetElement.closest('#song-share-modal'))
          || eventPathIncludes(songShareModal)
        )
      );
      if (clickedInsideSongShareModalPre) return;
      const clickedInsideSongShareMergeModalPre = Boolean(
        songShareMergeModal
        && (
          (targetElement && targetElement.closest('#song-share-merge-modal'))
          || eventPathIncludes(songShareMergeModal)
        )
      );
      if (clickedInsideSongShareMergeModalPre) return;
      const clickedInsideSongModalPre = Boolean(
        songModal
        && (
          (targetElement && targetElement.closest('#song-modal'))
          || eventPathIncludes(songModal)
        )
      );
      if (clickedInsideSongModalPre) return;
      const clickedInsideRosaryModalPre = Boolean(
        rosaryModal
        && (
          (targetElement && targetElement.closest('#rosary-modal'))
          || eventPathIncludes(rosaryModal)
        )
      );
      if (clickedInsideRosaryModalPre) return;
      const clickedInsideMysteryGroupModalPre = Boolean(
        mysteryGroupModal
        && (
          (targetElement && targetElement.closest('#mystery-group-modal'))
          || eventPathIncludes(mysteryGroupModal)
        )
      );
      if (clickedInsideMysteryGroupModalPre) return;
      if (isSongLocationCreateModalOpen()) return;
      const clickedInsideSongSaveLocationPicker = Boolean(
        songSaveLocationPicker
        && (
          (targetElement && targetElement.closest('#song-save-location-picker'))
          || eventPathIncludes(songSaveLocationPicker)
        )
      );
      if (clickedInsideSongSaveLocationPicker) return;
      if (isSongSaveLocationPickerOpen()) {
        const clickedAssignTrigger = Boolean(
          targetElement
          && targetElement.closest('.song-open-save-location-trigger')
        );
        if (!clickedAssignTrigger) {
          closeSongSaveLocationPicker();
        }
      }

      const clickedInsideSongModal = Boolean(
        targetElement
        && songModal
        && targetElement.closest('#song-modal')
      );
      if (clickedInsideSongModal) return;
      const songModalIsOpen = Boolean(songModal && songModal.classList.contains('open'));
      if (songModalIsOpen) return;
      const clickedInsideRosaryModal = Boolean(
        targetElement
        && rosaryModal
        && targetElement.closest('#rosary-modal')
      );
      if (clickedInsideRosaryModal) return;
      const rosaryModalIsOpen = Boolean(
        rosaryModal
        && rosaryModal.classList.contains('open')
      );
      if (rosaryModalIsOpen) return;
      const clickedInsideMysteryGroupModal = Boolean(
        targetElement
        && mysteryGroupModal
        && targetElement.closest('#mystery-group-modal')
      );
      if (clickedInsideMysteryGroupModal) return;
      const mysteryGroupModalIsOpen = Boolean(
        mysteryGroupModal
        && mysteryGroupModal.classList.contains('open')
      );
      if (mysteryGroupModalIsOpen) return;
      const clickedInsideFavoriteConfirmModal = Boolean(
        targetElement
        && favoriteConfirmModal
        && targetElement.closest('#favorite-confirm-modal')
      );
      if (clickedInsideFavoriteConfirmModal) return;
      const favoriteConfirmModalIsOpen = Boolean(
        favoriteConfirmModal
        && favoriteConfirmModal.classList.contains('open')
      );
      if (favoriteConfirmModalIsOpen) return;
      const clickedInsideCustomSongModal = Boolean(
        targetElement
        && customSongModal
        && targetElement.closest('#custom-song-modal')
      );
      if (clickedInsideCustomSongModal) return;
      const customSongModalIsOpen = Boolean(
        customSongModal
        && customSongModal.classList.contains('open')
      );
      if (customSongModalIsOpen) return;
      const clickedInsideMysterySongAssignModal = Boolean(
        targetElement
        && mysterySongAssignModal
        && targetElement.closest('#mystery-song-assign-modal')
      );
      if (clickedInsideMysterySongAssignModal) return;
      const mysterySongAssignModalIsOpen = Boolean(
        mysterySongAssignModal
        && mysterySongAssignModal.classList.contains('open')
      );
      if (mysterySongAssignModalIsOpen) return;
      const clickedInsideAuthModal = Boolean(
        targetElement
        && authModal
        && targetElement.closest('#auth-modal')
      );
      if (clickedInsideAuthModal) return;
      const authModalIsOpen = Boolean(
        authModal
        && authModal.classList.contains('open')
      );
      if (authModalIsOpen) return;
      const clickedInsideAuthSessionsModal = Boolean(
        targetElement
        && authSessionsModal
        && targetElement.closest('#auth-sessions-modal')
      );
      if (clickedInsideAuthSessionsModal) return;
      const authSessionsModalIsOpen = Boolean(
        authSessionsModal
        && authSessionsModal.classList.contains('open')
      );
      if (authSessionsModalIsOpen) return;
      const clickedInsideSongShareModal = Boolean(
        targetElement
        && songShareModal
        && targetElement.closest('#song-share-modal')
      );
      if (clickedInsideSongShareModal) return;
      const songShareModalIsOpen = Boolean(
        songShareModal
        && songShareModal.classList.contains('open')
      );
      if (songShareModalIsOpen) return;
      const clickedInsideSongShareMergeModal = Boolean(
        targetElement
        && songShareMergeModal
        && targetElement.closest('#song-share-merge-modal')
      );
      if (clickedInsideSongShareMergeModal) return;
      const songShareMergeModalIsOpen = Boolean(
        songShareMergeModal
        && songShareMergeModal.classList.contains('open')
      );
      if (songShareMergeModalIsOpen) return;

      const clickedInsideSongSearch = songSearchWidgets.some((widget) => (
        (widget.form && widget.form.contains(target))
        || (widget.resultsContainer && widget.resultsContainer.contains(target))
        || (widget.searchBtn && widget.searchBtn.contains(target))
        || (widget.clearBtn && widget.clearBtn.contains(target))
        || (widget.input && widget.input.contains(target))
      ));

      if (clickedInsideSongSearch) return;
      const clickedInsideOpenModalDialog = Boolean(
        targetElement
        && (
          (songModal && songModal.classList.contains('open') && targetElement.closest('.song-modal-dialog'))
          || (mysteryModal && mysteryModal.classList.contains('open') && targetElement.closest('.mystery-modal-dialog'))
          || (mysteryGroupModal && mysteryGroupModal.classList.contains('open') && targetElement.closest('.mystery-group-modal-dialog'))
          || (rosaryModal && rosaryModal.classList.contains('open') && targetElement.closest('.rosary-modal-dialog'))
          || (
            favoriteConfirmModal
            && favoriteConfirmModal.classList.contains('open')
            && targetElement.closest('.favorite-confirm-dialog')
          )
          || (
            customSongModal
            && customSongModal.classList.contains('open')
            && targetElement.closest('.custom-song-dialog')
          )
          || (
            mysterySongAssignModal
            && mysterySongAssignModal.classList.contains('open')
            && targetElement.closest('.mystery-song-assign-dialog')
          )
          || (
            authModal
            && authModal.classList.contains('open')
            && targetElement.closest('.auth-modal-dialog')
          )
          || (
            authSessionsModal
            && authSessionsModal.classList.contains('open')
            && targetElement.closest('.auth-sessions-dialog')
          )
          || (
            songShareModal
            && songShareModal.classList.contains('open')
            && targetElement.closest('.song-share-dialog')
          )
          || (
            songShareMergeModal
            && songShareMergeModal.classList.contains('open')
            && targetElement.closest('.song-share-merge-dialog')
          )
          || (
            songLocationCreateModal
            && songLocationCreateModal.classList.contains('open')
            && targetElement.closest('.song-location-create-dialog')
          )
        )
      );
      if (clickedInsideOpenModalDialog) return;

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

  document.addEventListener('visibilitychange', () => {
    if (!isAuthLoggedIn()) {
      clearAuthSessionHealthcheckTimer();
      return;
    }
    if (document.visibilityState === 'visible') {
      scheduleAuthSessionHealthcheck(900);
    }
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

  const isModalElementOpen = (modalElement) => Boolean(
    modalElement
    && modalElement.classList.contains('open')
  );

  const resolveModalZIndex = (modalElement, fallbackZIndex = 0) => {
    if (!(modalElement instanceof HTMLElement)) return fallbackZIndex;
    const computedZIndex = Number.parseFloat(window.getComputedStyle(modalElement).zIndex);
    return Number.isFinite(computedZIndex) ? computedZIndex : fallbackZIndex;
  };

  const resolveTopOpenModalCloseAction = () => {
    const modalCloseActions = [
      {
        element: customSongModal,
        fallbackZIndex: 150,
        isOpen: () => isModalElementOpen(customSongModal),
        close: () => closeCustomSongModal({ preserveDraft: true }),
      },
      {
        element: favoriteConfirmModal,
        fallbackZIndex: 146,
        isOpen: () => isModalElementOpen(favoriteConfirmModal),
        close: () => closeFavoriteConfirmModal(FAVORITE_CONFIRM_ACTION_DISMISS),
      },
      {
        element: songShareMergeModal,
        fallbackZIndex: 145,
        isOpen: () => isModalElementOpen(songShareMergeModal),
        close: () => closeSongShareMergeModal({
          action: SONG_SHARE_MERGE_ACTION_DISMISS,
          excludeConflictKeys: [],
        }),
      },
      {
        element: songShareModal,
        fallbackZIndex: 144,
        isOpen: () => isModalElementOpen(songShareModal),
        close: () => closeSongShareModal(),
      },
      {
        element: authSessionsModal,
        fallbackZIndex: 143,
        isOpen: () => isModalElementOpen(authSessionsModal),
        close: () => closeAuthSessionsModal(),
      },
      {
        element: authModal,
        fallbackZIndex: 142,
        isOpen: () => isModalElementOpen(authModal),
        close: () => closeAuthModal(),
      },
      {
        element: mysteryGroupModal,
        fallbackZIndex: 141,
        isOpen: () => isModalElementOpen(mysteryGroupModal),
        close: () => closeMysteryGroupModal({ restoreFocus: true }),
      },
      {
        element: songLocationCreateModal,
        fallbackZIndex: 139,
        isOpen: () => isSongLocationCreateModalOpen(),
        close: () => closeSongLocationCreateModal(),
      },
      {
        element: songSaveLocationPicker,
        fallbackZIndex: 138,
        isOpen: () => isSongSaveLocationPickerOpen(),
        close: () => closeSongSaveLocationPicker(),
      },
      {
        element: mysterySongAssignModal,
        fallbackZIndex: 133,
        isOpen: () => isModalElementOpen(mysterySongAssignModal),
        close: () => closeMysterySongAssignModal(),
      },
      {
        element: mysteryModal,
        fallbackZIndex: 120,
        isOpen: () => isModalElementOpen(mysteryModal),
        close: () => closeMysteryModal(),
      },
      {
        element: rosaryModal,
        fallbackZIndex: 118,
        isOpen: () => isModalElementOpen(rosaryModal),
        close: () => closeRosaryModal(),
      },
      {
        element: songModal,
        fallbackZIndex: 91,
        isOpen: () => isModalElementOpen(songModal),
        close: () => {
          void closeSongModal();
        },
      },
    ];

    const openModalActions = modalCloseActions
      .map((action, order) => ({
        ...action,
        order,
        zIndex: resolveModalZIndex(action.element, action.fallbackZIndex),
      }))
      .filter((action) => action.isOpen());

    if (!openModalActions.length) return null;

    openModalActions.sort((left, right) => {
      if (left.zIndex !== right.zIndex) {
        return right.zIndex - left.zIndex;
      }
      return right.order - left.order;
    });

    return openModalActions[0].close;
  };

  const closeTopOpenModal = () => {
    const closeAction = resolveTopOpenModalCloseAction();
    if (typeof closeAction !== 'function') return false;
    closeAction();
    return true;
  };

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
      closeMainMenu();
      if (event.defaultPrevented) return;
      if (closeTopOpenModal()) {
        event.preventDefault();
      }
    }
  });
})();



