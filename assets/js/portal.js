(async () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const menuList = document.getElementById('menu-list');
  const menuRootLevel = menuList ? menuList.querySelector('.dl-menu') : null;
  const menuCloseButtons = menuList ? menuList.querySelectorAll('[data-menu-close]') : [];
  const menuParentTriggers = menuList ? Array.from(menuList.querySelectorAll('.menu-parent-trigger')) : [];
  const menuBackTriggers = menuList ? Array.from(menuList.querySelectorAll('.menu-back-trigger')) : [];
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
  const readUiMessage = (path, fallback = '') => {
    const value = getNestedValue(portalContent, `uiMessages.${path}`);
    return typeof value === 'string' ? value : fallback;
  };
  const readSongMessage = (key, fallback = '', replacements = null) => {
    const template = readUiMessage(`song.${key}`, fallback);
    return replacements ? formatTemplate(template, replacements) : template;
  };
  const readMysteryMessage = (key, fallback = '', replacements = null) => {
    const template = readUiMessage(`mystery.${key}`, fallback);
    return replacements ? formatTemplate(template, replacements) : template;
  };
  const SONG_SEARCH_BUTTON_ICON = [
    '<svg viewBox="0 0 24 24" aria-hidden="true">',
    '<circle cx="11" cy="11" r="6"></circle>',
    '<path d="M16 16l5 5"></path>',
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
  const STEP_CARD_LABEL_OPEN = 'Ocultar conteúdo';
  const STEP_CARD_LABEL_CLOSED = 'Ver conteúdo';
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
    setNodeAttr('.menu-toggle', 'aria-label', readUiMessage('menu.openAria', 'Abrir menu'));

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
    setNodeAttr('.font-controls', 'aria-label', readUiMessage('controls.fontGroupAria', 'Controle de fonte'));
    setNodeAttr('#font-decrease', 'aria-label', readUiMessage('controls.fontDecreaseAria', 'Diminuir fonte'));
    setNodeAttr('#font-increase', 'aria-label', readUiMessage('controls.fontIncreaseAria', 'Aumentar fonte'));
    setNodeText('#font-decrease', readUiMessage('controls.fontDecreaseLabel', 'A-'));
    setNodeText('#font-increase', readUiMessage('controls.fontIncreaseLabel', 'A+'));
    setNodeAttr('#theme-toggle', 'aria-label', readUiMessage('theme.toggleAria', 'Alternar tema claro e escuro'));

    setNodeText('#inicio .eyebrow', content.hero?.eyebrow);
    setNodeText('#inicio h1', content.hero?.title);
    setNodeText('#inicio .hero-lead', content.hero?.lead);
    updateLinksFromConfig(
      Array.from(document.querySelectorAll('#inicio .hero-actions a')),
      content.hero?.actions || []
    );
    setNodeText('#inicio .today-label', content.hero?.today?.label);
    setNodeText('#inicio .today-note', content.hero?.today?.note);
    setNodeAttr('#inicio .today-visual img', 'src', content.hero?.today?.image?.src);
    setNodeAttr('#inicio .today-visual img', 'alt', content.hero?.today?.image?.alt);

    setNodeText('#historia .section-header .section-kicker', content.historia?.header?.kicker);
    setNodeText('#historia .section-header h2', content.historia?.header?.title);
    setNodeText('#historia .section-header p', content.historia?.header?.description);
    setNodeText('#historia .story-intro', content.historia?.intro);
    setNodeAttr('#historia .story-tabs', 'aria-label', content.historia?.tabsAriaLabel || 'Capítulos da história');
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
        if (titleNode && typeof stepConfig.title === 'string') {
          titleNode.textContent = stepConfig.title;
        }
        if (textNode && typeof stepConfig.text === 'string') {
          textNode.textContent = stepConfig.text;
        }
        stepNode.classList.toggle('highlight', Boolean(stepConfig.highlight));

        const detailText = typeof stepConfig.content === 'string'
          ? stepConfig.content.trim()
          : '';
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
    setNodeText('#cantos .section-header p', content.cantos?.header?.description);
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
    setNodeText('#song-favorites-description', content.cantos?.favorites?.description);
    setNodeText('#custom-songs-title', readSongMessage('customSongsTitle', 'Nossas músicas'));
    setNodeText('#custom-songs-description', readSongMessage('customSongsDescription', 'Adicione músicas manuais com letra e cifra.'));
    setNodeText('#custom-songs-add-btn', readSongMessage('customSongsAddButton', 'Adicionar música'));
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
          searchButton.setAttribute('aria-label', `Buscar "${query}"`);
          searchButton.setAttribute('title', `Buscar "${query}"`);
          searchButton.innerHTML = SONG_SEARCH_BUTTON_ICON;

          const title = document.createElement('strong');
          title.className = 'booklet-cantos-title';
          title.textContent = item.title;

          const meta = document.createElement('p');
          meta.className = 'booklet-cantos-meta';
          const pageLabel = typeof item.page === 'string' && item.page.trim()
            ? `Pág. ${item.page.trim()}`
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
    setNodeAttr('.song-modal-close', 'aria-label', readSongMessage('closeModalAria', 'Fechar cifra'));
    setNodeText('#fetched-song-title', readSongMessage('loadedSongTitle', 'Música carregada'));
    setNodeText('#fetched-song-meta', readSongMessage('originalKeyUnknownTemplate', 'Tom original: -'));
    setNodeText('.song-modal-tone-label', readSongMessage('toneLabel', 'Tom:'));
    setNodeAttr('#song-tone-grid', 'aria-label', readSongMessage('tonePickerAriaLabel', 'Escolher tom'));
    setNodeText('#song-tone-reset', readSongMessage('toneResetLabel', 'Restaurar'));
    setNodeText('#favorite-confirm-title', readSongMessage('favoriteRemoveConfirmTitle', 'Remover favorito'));
    setNodeText('#favorite-confirm-cancel', readSongMessage('favoriteRemoveConfirmCancel', 'Cancelar'));
    setNodeText('#favorite-confirm-accept', readSongMessage('favoriteRemoveConfirmAccept', 'Remover'));
    setNodeText('#custom-song-modal-title', readSongMessage('customSongModalTitle', 'Nova música manual'));
    setNodeText('#custom-song-title-label', readSongMessage('customSongTitleLabel', 'Título'));
    setNodeText('#custom-song-key-label', readSongMessage('customSongKeyLabel', 'Tom'));
    setNodeText('#custom-song-tab-lyrics', readSongMessage('customSongLyricsTab', 'Música'));
    setNodeText('#custom-song-tab-chords', readSongMessage('customSongChordsTab', 'Cifras'));
    setNodeText('#custom-song-lyrics-label', readSongMessage('customSongLyricsLabel', 'Texto da música'));
    setNodeText('#custom-song-chords-label', readSongMessage('customSongChordsLabel', 'Texto da cifra'));
    setNodeText('#custom-song-cancel-btn', readSongMessage('customSongCancelButton', 'Cancelar'));
    setNodeText('#custom-song-save-btn', readSongMessage('customSongSaveButton', 'Salvar música'));
    setNodeAttr('#custom-song-title-input', 'placeholder', readSongMessage('customSongTitlePlaceholder', 'Ex.: Minha Música'));
    setNodeAttr('#custom-song-key-input', 'placeholder', readSongMessage('customSongKeyPlaceholder', 'Ex.: D'));
    setNodeAttr('#custom-song-lyrics-input', 'placeholder', readSongMessage('customSongLyricsPlaceholder', 'Digite aqui o texto da música...'));
    setNodeAttr('#custom-song-chords-input', 'placeholder', readSongMessage('customSongChordsPlaceholder', 'Digite aqui a cifra...'));
    setNodeAttr('#custom-song-modal-close', 'aria-label', readSongMessage('customSongCloseAria', 'Fechar editor'));
    setNodeAttr('#custom-song-modal-close', 'title', readSongMessage('customSongCloseAria', 'Fechar editor'));
    setNodeText(
      '#favorite-confirm-message',
      readSongMessage('favoriteRemoveConfirmMessage', 'Tem certeza de que deseja remover este favorito?')
    );

    setNodeText('#oracoes .section-header .section-kicker', content.oracoes?.header?.kicker);
    setNodeText('#oracoes .section-header h2', content.oracoes?.header?.title);
    setNodeText('#oracoes .section-header p', content.oracoes?.header?.description);
    if (Array.isArray(content.oracoes?.items)) {
      const prayerGrid = document.querySelector('#oracoes .prayer-grid');
      const openLabel = content.oracoes?.accordion?.openLabel || 'Ocultar oração';
      const closedLabel = content.oracoes?.accordion?.closedLabel || 'Ver oração';
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
            action.textContent = item.linkLabel || 'Abrir';
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
    setNodeAttr('.mystery-modal-close', 'aria-label', content.misterios?.modal?.closeAriaLabel);
    setNodeAttr(
      '#mystery-jaculatory-close',
      'aria-label',
      readMysteryMessage('closeJaculatoryAria', 'Fechar jaculatória')
    );
    setNodeAttr(
      '#mystery-jaculatory-close',
      'title',
      readMysteryMessage('closeJaculatoryAria', 'Fechar jaculatória')
    );
    setNodeText('#mystery-jaculatory-toggle', content.misterios?.modal?.toggleShow);
    setNodeText('#mystery-jaculatory-panel .mystery-jaculatory-title', content.misterios?.modal?.jaculatoryTitle);
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

  const closeMainMenu = () => {
    if (!menuToggle || !menuList) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', readUiMessage('menu.openAria', 'Abrir menu'));
    menuList.classList.remove('open');
    closeMenuDropdowns();
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
          ? readUiMessage('menu.closeAria', 'Fechar menu')
          : readUiMessage('menu.openAria', 'Abrir menu')
      );
      if (nextState) {
        closeMenuDropdowns();
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
      const isInsideMenu = menuList.contains(event.target) || menuToggle.contains(event.target);
      if (!isInsideMenu) {
        closeMainMenu();
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
      themeToggleBtn.setAttribute(
        'aria-label',
        isDark
          ? readUiMessage('theme.enableLight', 'Ativar tema claro')
          : readUiMessage('theme.enableDark', 'Ativar tema escuro')
      );
      themeToggleBtn.setAttribute(
        'title',
        isDark
          ? readUiMessage('theme.darkActive', 'Tema escuro ativo')
          : readUiMessage('theme.lightActive', 'Tema claro ativo')
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
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#') || href.length <= 1) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;

      if (portalModeEnabled) {
        event.preventDefault();
        setPortalActiveSection(target.id, { updateHash: true, behavior: 'auto' });
      } else {
        setActiveSectionLink(target.id);
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
  window.addEventListener('touchstart', (event) => {
    if (!document.body.classList.contains('landscape-mobile')) return;
    const hasOpenModal = Boolean(document.querySelector('.mystery-modal.open, .song-modal.open'));
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
  const mysteryJaculatoryToggle = document.getElementById('mystery-jaculatory-toggle');
  const mysteryJaculatoryPanel = document.getElementById('mystery-jaculatory-panel');
  const mysteryJaculatoryClose = document.getElementById('mystery-jaculatory-close');
  const mysteryModalCloseButtons = document.querySelectorAll('[data-mystery-modal-close]');
  let lastFocusedMystery = null;

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

  const resolveMysteryGroupTitle = (group) => {
    const rawGroup = (group || '').trim();
    if (!rawGroup) return readMysteryMessage('groupFallback', 'Mistério do Terço');
    if (mysteryItemsByGroup[rawGroup]) return rawGroup;

    const normalized = rawGroup
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (normalized.includes('gozoso')) return readMysteryMessage('groupGozosos', 'Mistérios Gozosos');
    if (normalized.includes('doloroso')) return readMysteryMessage('groupDolorosos', 'Mistérios Dolorosos');
    if (normalized.includes('glorioso')) return readMysteryMessage('groupGloriosos', 'Mistérios Gloriosos');
    if (normalized.includes('luminoso')) return readMysteryMessage('groupLuminosos', 'Mistérios Luminosos');
    return rawGroup || readMysteryMessage('unknownGroup', 'Mistério do Terço');
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
      link.textContent = readMysteryMessage('modalLinkLabel', '{index}º Mistério', { index: index + 1 });
      link.dataset.shortLabel = String(index + 1);
      link.title = itemTitle;
      link.setAttribute('aria-label', readMysteryMessage('modalLinkAria', '{index}º Mistério: {title}', {
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

  let modalLockedScrollX = 0;
  let modalLockedScrollY = 0;
  const MODAL_OPEN_SELECTOR = '.mystery-modal.open, .song-modal.open, .favorite-confirm-modal.open, .custom-song-modal.open';

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

  const setMysteryJaculatoryVisible = (visible) => {
    if (!mysteryJaculatoryToggle || !mysteryJaculatoryPanel) return;

    mysteryJaculatoryPanel.hidden = !visible;
    mysteryJaculatoryToggle.hidden = visible;
    mysteryJaculatoryToggle.setAttribute('aria-expanded', String(visible));
    mysteryJaculatoryToggle.setAttribute('aria-hidden', String(visible));
    mysteryJaculatoryToggle.classList.remove('is-active');
    mysteryJaculatoryToggle.textContent = readMysteryMessage('toggleShow', 'Exibir jaculatória');
  };

  const openMysteryModal = (title, group) => {
    if (!mysteryModal || !mysteryModalTitle || !mysteryModalText || !mysteryModalGroup) return;

    ensureMysteryNavBeforeTitle();
    const shouldResetJaculatory = !mysteryModal.classList.contains('open');
    const resolvedGroup = resolveMysteryGroupTitle(group);
    const meditation = mysteryMeditations[title]
      || readMysteryMessage('emptyMeditation', 'Meditação em preparação. Em breve o texto completo deste mistério estará disponível.');
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
    const focusTarget = lastFocusedMystery instanceof HTMLElement ? lastFocusedMystery : null;
    mysteryModal.classList.remove('open');
    mysteryModal.setAttribute('aria-hidden', 'true');
    setMysteryJaculatoryVisible(false);
    syncBodyModalLock();
    if (!hasAnyOpenModal() && focusTarget) {
      window.requestAnimationFrame(() => {
        focusWithoutScrollingPage(focusTarget);
      });
    }
    lastFocusedMystery = null;
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
      const group = element.dataset.mysteryGroup || fallbackGroup || readMysteryMessage('groupFallback', 'Mistério do Terço');
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

  if (mysteryJaculatoryClose) {
    mysteryJaculatoryClose.addEventListener('click', () => {
      setMysteryJaculatoryVisible(false);
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
      || 'Ver oração';
    const openLabel = button.dataset.openLabel
      || portalContent?.oracoes?.accordion?.openLabel
      || 'Ocultar oração';
    const stateLabel = open ? openLabel : closedLabel;
    const labelNode = button.querySelector('.accordion-trigger-label');

    card.classList.toggle('open', open);
    body.style.maxHeight = open ? `${body.scrollHeight}px` : '0px';
    button.dataset.eyeState = open ? 'closed' : 'open';
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
  const customSongsCard = document.getElementById('custom-songs-card');
  const customSongsList = document.getElementById('custom-songs-list');
  const customSongsAddBtn = document.getElementById('custom-songs-add-btn');
  const songToast = document.getElementById('song-toast');
  const favoriteConfirmModal = document.getElementById('favorite-confirm-modal');
  const favoriteConfirmTitle = document.getElementById('favorite-confirm-title');
  const favoriteConfirmMessage = document.getElementById('favorite-confirm-message');
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
  const fetchedSongLyrics = document.getElementById('fetched-song-lyrics');
  const songModalToneRow = songModal ? songModal.querySelector('.song-modal-tone-row') : null;
  const songModalToneLabel = songModal ? songModal.querySelector('.song-modal-tone-label') : null;
  const songToneResetBtn = document.getElementById('song-tone-reset');
  const songToneGrid = document.getElementById('song-tone-grid');
  let lastFocusedSongTrigger = null;
  let lastFocusedFavoriteConfirmTrigger = null;
  let lastFocusedCustomSongTrigger = null;
  let pendingFavoriteConfirmResolver = null;
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
  const songSearchFallbackImage = portalContent?.cantos?.search?.resultFallbackImage || './assets/img/logo.png';
  let songFavorites = [];
  let songFavoritesLoading = false;
  let songFavoritesReorderPending = false;
  let songFavoritesDragId = '';
  let songFavoritesDragStartOrder = [];
  const songFavoritesByUrl = new Map();

  const normalizeSongUrlKey = (url) => (url || '').trim().toLowerCase();
  const normalizeSongFavorite = (rawFavorite) => {
    const favorite = asObject(rawFavorite);
    const url = (favorite.url || favorite.song_url || '').trim();
    const lyricsText = String(favorite.lyrics_text || favorite.lyricsText || '');
    const chordsText = String(favorite.chords_text || favorite.chordsText || '');
    const parsedOrderIndex = Number.parseInt(String(favorite.orderIndex ?? favorite.order_index ?? ''), 10);
    const hasLyrics = Boolean(favorite.has_lyrics) || Boolean(favorite.hasLyrics) || Boolean(lyricsText.trim());
    const hasChords = Boolean(favorite.has_chords) || Boolean(favorite.hasChords) || Boolean(chordsText.trim());

    return {
      id: Number(favorite.id) || 0,
      orderIndex: Number.isInteger(parsedOrderIndex) && parsedOrderIndex > 0 ? parsedOrderIndex : 0,
      url,
      title: (favorite.title || '').trim() || readSongMessage('defaultSongTitle', 'Música'),
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
      chordsText,
      hasLyrics,
      hasChords,
      updatedAtUtc: (favorite.updated_at_utc || favorite.updatedAtUtc || '').trim(),
      createdAtUtc: (favorite.created_at_utc || favorite.createdAtUtc || '').trim(),
    };
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

    if (source === 'cifraclub') return readSongMessage('sourceLabelCifraClub', 'Cifra Club');
    if (source === 'letras') return readSongMessage('sourceLabelLetras', 'Letras.mus.br');
    return readSongMessage('sourceLabelCifras', 'Cifras');
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
    const safeTitle = (targetSong.title || songState.title || readSongMessage('defaultSongTitle', 'Música')).trim();

    const shouldUpdate = await openFavoriteConfirmModal({
      triggerElement,
      songTitle: safeTitle,
      title: readSongMessage('customSongToneConfirmTitle', 'Atualizar tom salvo'),
      message: readSongMessage(
        'customSongToneConfirmMessage',
        'Deseja atualizar o tom de "{title}" para "{key}"?',
        { title: safeTitle, key: selectedKey }
      ),
      cancelLabel: readSongMessage('customSongToneConfirmCancel', 'Não atualizar'),
      acceptLabel: readSongMessage('customSongToneConfirmAccept', 'Atualizar tom'),
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

      setSongFeedback(readSongMessage('customSongToneUpdateSuccess', 'Tom da música atualizado com sucesso.'), 'is-success');
      return true;
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongToneUpdateError', 'Não foi possível atualizar o tom salvo.');
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

  const resolvePendingFavoriteConfirm = (confirmed) => {
    if (!pendingFavoriteConfirmResolver) return;
    const resolve = pendingFavoriteConfirmResolver;
    pendingFavoriteConfirmResolver = null;
    resolve(Boolean(confirmed));
  };

  const closeFavoriteConfirmModal = (confirmed = false) => {
    if (!favoriteConfirmModal) {
      resolvePendingFavoriteConfirm(confirmed);
      return;
    }
    const focusTarget = (
      lastFocusedFavoriteConfirmTrigger instanceof HTMLElement
        ? lastFocusedFavoriteConfirmTrigger
        : null
    );
    favoriteConfirmModal.classList.remove('open');
    favoriteConfirmModal.setAttribute('aria-hidden', 'true');
    syncBodyModalLock();
    resolvePendingFavoriteConfirm(confirmed);
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
    ) || readSongMessage('defaultSongTitle', 'Música');
    const title = String(options.title || '').trim()
      || readSongMessage('favoriteRemoveConfirmTitle', 'Remover favorito');
    const cancelLabel = String(options.cancelLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmCancel', 'Cancelar');
    const acceptLabel = String(options.acceptLabel || '').trim()
      || readSongMessage('favoriteRemoveConfirmAccept', 'Remover');
    const message = String(options.message || '').trim()
      || readSongMessage(
        'favoriteRemoveConfirmMessageWithTitle',
        'Deseja remover "{title}" dos favoritos?',
        { title: resolvedSongTitle }
      );

    if (!favoriteConfirmModal || !favoriteConfirmMessage || !favoriteConfirmAcceptBtn) {
      return Promise.resolve(window.confirm(message));
    }

    if (favoriteConfirmTitle) {
      favoriteConfirmTitle.textContent = title;
    }
    if (favoriteConfirmCancelBtn) {
      favoriteConfirmCancelBtn.textContent = cancelLabel;
    }
    favoriteConfirmAcceptBtn.textContent = acceptLabel;
    favoriteConfirmMessage.textContent = message;

    if (pendingFavoriteConfirmResolver) {
      resolvePendingFavoriteConfirm(false);
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
      button.addEventListener('click', () => closeFavoriteConfirmModal(false));
    });
  }
  if (favoriteConfirmAcceptBtn) {
    favoriteConfirmAcceptBtn.addEventListener('click', () => closeFavoriteConfirmModal(true));
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
    if (!songState.originalRoot) return readSongMessage('notInformed', 'Não informado');
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
      songModalToneLabel.textContent = readSongMessage('toneLabel', 'Tom:');
    }
  };

  const renderFetchedSong = () => {
    if (!songState.loaded) return;

    const displayTitle = songState.artist
      ? `${songState.title || readSongMessage('defaultSongTitle', 'Música')} - ${songState.artist}`
      : (songState.title || readSongMessage('loadedSongTitle', 'Música carregada'));

    if (fetchedSongTitle) {
      fetchedSongTitle.textContent = displayTitle;
    }

    if (fetchedSongMeta) {
      const sourceLabel = songState.sourceLabel || readSongMessage('sourceDefault', 'Portal');
      const sourcePrefix = readSongMessage('sourcePrefix', 'Fonte:');
      if (songState.contentType === 'lyrics') {
        fetchedSongMeta.textContent = `${sourcePrefix} ${sourceLabel}`;
      } else {
        const original = songState.originalKey || readSongMessage('notInformed', 'Não informado');
        const originalPrefix = readSongMessage('originalKeyPrefix', 'Tom original:');
        fetchedSongMeta.textContent = `${originalPrefix} ${original} | ${sourcePrefix} ${sourceLabel}`;
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
      const loadingLabel = readSongMessage('loadingAction', 'Carregando...');
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

  async function loadSongFromUrl(url, triggerButton = null, selectedResult = null) {
    const safeUrl = (url || '').trim();
    if (!safeUrl) {
      setSongFeedback(readSongMessage('invalidChordLink', 'A opção selecionada não possui um link válido de cifra.'), 'is-error');
      return;
    }

    setSongActionLoading(triggerButton, true, readSongMessage('chordsButton', 'Cifra'));
    setSongFeedback(readSongMessage('loadingChord', 'Carregando cifra selecionada...'), 'is-loading');

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
        const message = payload?.detail?.message || payload?.message || readSongMessage('chordFetchErrorApi', 'Não foi possível carregar a cifra.');
        throw new Error(message);
      }

      const selectedTitle = (selectedResult?.title || '').trim();
      const selectedArtist = (selectedResult?.artist || '').trim();
      const keyParts = splitKey(payload.original_key || '');
      songState.loaded = true;
      songState.title = selectedTitle || payload.title || readSongMessage('defaultSongTitle', 'Música');
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

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      setSongFeedback(readSongMessage('chordLoaded', 'Cifra carregada. Ajuste o tom abaixo do título.'), 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : readSongMessage('chordLoadError', 'Falha ao carregar a cifra.');
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, readSongMessage('chordsButton', 'Cifra'));
    }
  }

  async function loadLyricsFromService(result, triggerButton = null) {
    const title = (result?.title || '').trim();
    const artist = (result?.artist || '').trim();
    const sourceUrl = (result?.url || '').trim();

    if (!title && !sourceUrl) {
      setSongFeedback(readSongMessage('invalidLyricsTarget', 'Não foi possível identificar a música para buscar a letra.'), 'is-error');
      return;
    }

    setSongActionLoading(triggerButton, true, readSongMessage('lyricsButton', 'Letra'));
    setSongFeedback(readSongMessage('loadingLyrics', 'Buscando letra no Letras.mus.br...'), 'is-loading');

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
        const message = payload?.detail?.message || payload?.message || readSongMessage('lyricsFetchErrorApi', 'Não foi possível carregar a letra.');
        const code = payload?.detail?.code || payload?.code || '';
        const error = new Error(message);
        if (code) {
          error.code = code;
        }
        throw error;
      }

      songState.loaded = true;
      songState.title = title || payload.title || readSongMessage('defaultSongTitle', 'Música');
      songState.artist = artist || payload.artist || '';
      songState.source = payload.source || 'letras';
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
      setSongFeedback(readSongMessage('lyricsLoaded', 'Letra carregada com sucesso.'), 'is-success');
    } catch (err) {
      const message = err instanceof Error ? err.message : readSongMessage('lyricsLoadError', 'Falha ao carregar a letra.');
      const isLyricsNotFound = (
        err
        && typeof err === 'object'
        && 'code' in err
        && err.code === 'lyrics_not_found'
      ) || message === readSongMessage('lyricsNotFoundApiMessage', 'Não foi possível carregar a letra no Letras.mus.br para esta música.');

      if (isLyricsNotFound) {
        showSongToast(readSongMessage('lyricsNotFoundToast', 'Não encontramos a letra no Letras.mus.br para esta música.'), 'is-warning');
      }
      setSongFeedback(message, 'is-error');
    } finally {
      setSongActionLoading(triggerButton, false, readSongMessage('lyricsButton', 'Letra'));
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
      ? readSongMessage('favoriteButtonRemove', 'Remover favorito')
      : readSongMessage('favoriteButtonAdd', 'Favoritar');
    button.setAttribute(
      'aria-label',
      isSaved
        ? readSongMessage('favoriteAriaRemove', 'Remover música dos favoritos')
        : readSongMessage('favoriteAriaAdd', 'Salvar música nos favoritos')
    );
  };

  const applyFavoriteStateToRenderedButtons = (urlKey, isSaved) => {
    if (!urlKey) return;
    document
      .querySelectorAll(`.song-search-action-favorite[data-song-url-key="${urlKey}"]`)
      .forEach((button) => setFavoriteButtonState(button, isSaved, false));
  };

  const openSongFavoriteCached = (favorite, mode, triggerButton) => {
    const safeFavorite = asObject(favorite);
    const isLyricsMode = mode === 'lyrics';
    const content = String(isLyricsMode ? (safeFavorite.lyricsText || '') : (safeFavorite.chordsText || ''));
    if (!content.trim()) {
      if (isLyricsMode) {
        loadLyricsFromService({
          title: safeFavorite.title || '',
          artist: safeFavorite.artist || '',
          url: safeFavorite.url || '',
        }, triggerButton);
      } else {
        loadSongFromUrl(safeFavorite.url || '', triggerButton, {
          title: safeFavorite.title || '',
          artist: safeFavorite.artist || '',
        });
      }
      return;
    }

    const fallbackLabel = isLyricsMode
      ? readSongMessage('lyricsButton', 'Letra')
      : readSongMessage('chordsButton', 'Cifra');
    setSongActionLoading(triggerButton, true, fallbackLabel);
    setSongFeedback(
      isLyricsMode
        ? readSongMessage('loadingLyrics', 'Buscando letra no Letras.mus.br...')
        : readSongMessage('loadingChord', 'Carregando cifra selecionada...'),
      'is-loading'
    );

    try {
      songState.loaded = true;
      songState.title = (safeFavorite.title || '').trim() || readSongMessage('defaultSongTitle', 'Música');
      songState.artist = (safeFavorite.artist || '').trim();
      songState.semitones = 0;
      songState.originalContent = content;

      if (isLyricsMode) {
        songState.source = (safeFavorite.lyricsSource || '').trim() || 'letras';
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
      }
      songState.customSongId = '';
      songState.customSongIsDraft = false;

      if (fetchedSongCard) {
        fetchedSongCard.hidden = false;
      }

      renderFetchedSong();
      openSongModal(triggerButton);
      setSongFeedback(
        isLyricsMode
          ? readSongMessage('favoriteCachedLyricsLoaded', 'Letra carregada dos favoritos.')
          : readSongMessage('favoriteCachedChordsLoaded', 'Cifra carregada dos favoritos.'),
        'is-success'
      );
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
          ? readSongMessage('customSongLyricsMissing', 'Esta música manual ainda não possui letra.')
          : readSongMessage('customSongChordsMissing', 'Esta música manual ainda não possui cifra.'),
        'is-warning'
      );
      return;
    }

    const fallbackLabel = isLyricsMode
      ? readSongMessage('lyricsButton', 'Letra')
      : readSongMessage('chordsButton', 'Cifra');
    setSongActionLoading(triggerButton, true, fallbackLabel);
    setSongFeedback(
      isLyricsMode
        ? readSongMessage('customSongLyricsLoading', 'Abrindo letra manual...')
        : readSongMessage('customSongChordsLoading', 'Abrindo cifra manual...'),
      'is-loading'
    );

    try {
      songState.loaded = true;
      songState.title = safeSong.title || readSongMessage('defaultSongTitle', 'Música');
      songState.artist = '';
      songState.source = 'manual';
      songState.sourceLabel = readSongMessage('customSongsTitle', 'Nossas músicas');
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
      setSongFeedback(
        isLyricsMode
          ? readSongMessage('customSongLyricsLoaded', 'Letra manual carregada.')
          : readSongMessage('customSongChordsLoaded', 'Cifra manual carregada.'),
        'is-success'
      );
    } finally {
      setSongActionLoading(triggerButton, false, fallbackLabel);
    }
  };

  const renderSongFavorites = () => {
    if (!songFavoritesCard || !songFavoritesList) return;

    songFavoritesList.innerHTML = '';
    songFavoritesCard.hidden = false;
    if (songFavoritesLoading) {
      const loadingItem = document.createElement('li');
      loadingItem.className = 'booklet-cantos-item song-favorite-item song-favorites-empty song-favorites-loading';
      loadingItem.textContent = readSongMessage('favoritesLoading', 'Carregando favoritos...');
      songFavoritesList.appendChild(loadingItem);
      return;
    }

    if (!songFavorites.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'booklet-cantos-item song-favorite-item song-favorites-empty';
      emptyItem.textContent = readSongMessage('favoritesEmpty', 'Nenhuma música favoritada ainda.');
      songFavoritesList.appendChild(emptyItem);
      return;
    }
    songFavorites.forEach((favorite) => {
      const item = document.createElement('li');
      item.className = 'booklet-cantos-item song-favorite-item';
      const favoriteId = Number.parseInt(String(favorite.id || ''), 10);
      const isSortable = Number.isInteger(favoriteId) && favoriteId > 0;
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
        readSongMessage('favoriteSearchAria', 'Buscar "{query}"', { query })
      );
      coverButton.setAttribute(
        'title',
        readSongMessage('favoriteSearchAria', 'Buscar "{query}"', { query })
      );
      const coverImage = document.createElement('img');
      coverImage.className = 'song-favorite-cover';
      coverImage.loading = 'lazy';
      coverImage.decoding = 'async';
      coverImage.alt = favorite.artist
        ? readSongMessage('avatarAltWithArtist', 'Foto de {artist}', { artist: favorite.artist })
        : readSongMessage('avatarAltFallback', 'Imagem da música');
      coverImage.src = favorite.imageUrl || songSearchFallbackImage;
      coverImage.addEventListener('error', () => {
        coverImage.src = songSearchFallbackImage;
      });
      coverButton.appendChild(coverImage);

      const title = document.createElement('strong');
      title.className = 'booklet-cantos-title';
      title.textContent = favorite.title || readSongMessage('defaultSongTitle', 'Música');
      const headActions = document.createElement('div');
      headActions.className = 'song-favorite-head-actions';

      const meta = document.createElement('p');
      meta.className = 'booklet-cantos-meta';
      const singerPrefix = readSongMessage('singerPrefix', 'Cantor:');
      const sourcePrefix = readSongMessage('sourcePrefix', 'Fonte:');
      meta.textContent = favorite.artist
        ? `${singerPrefix} ${favorite.artist} | ${sourcePrefix} ${favorite.sourceLabel}`
        : `${sourcePrefix} ${favorite.sourceLabel}`;

      const externalQuery = buildExternalSongSearchQuery({
        title: favorite.title,
        artist: favorite.artist,
      });

      const spotifyAction = document.createElement('a');
      spotifyAction.className = 'song-search-action song-search-action-external';
      spotifyAction.classList.add('song-favorite-action-spotify');
      spotifyAction.innerHTML = SPOTIFY_ACTION_ICON;
      spotifyAction.title = readSongMessage('spotifyTitle', 'Abrir no Spotify');
      spotifyAction.setAttribute('aria-label', readSongMessage('spotifyAria', 'Abrir no Spotify'));
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
      youtubeAction.title = readSongMessage('youtubeTitle', 'Abrir no YouTube');
      youtubeAction.setAttribute('aria-label', readSongMessage('youtubeAria', 'Abrir no YouTube'));
      youtubeAction.href = favorite.youtubeUrl || buildExternalSongSearchUrl('youtube', externalQuery);
      youtubeAction.target = '_blank';
      youtubeAction.rel = 'noopener noreferrer';
      if (!youtubeAction.href) {
        youtubeAction.classList.add('is-disabled');
        youtubeAction.setAttribute('aria-disabled', 'true');
      }

      const lyricAction = document.createElement('button');
      lyricAction.type = 'button';
      lyricAction.className = 'song-search-action song-favorite-head-action';
      lyricAction.classList.add('song-favorite-action-lyrics');
      lyricAction.innerHTML = LYRICS_ACTION_ICON;
      lyricAction.title = readSongMessage('lyricsButton', 'Letra');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton', 'Letra'));
      lyricAction.disabled = !favorite.hasLyrics && !favorite.url;
      lyricAction.addEventListener('click', () => openSongFavoriteCached(favorite, 'lyrics', lyricAction));

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action song-favorite-head-action';
      chordAction.classList.add('song-favorite-action-chords');
      chordAction.innerHTML = CHORDS_ACTION_ICON;
      chordAction.title = readSongMessage('chordsButton', 'Cifra');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton', 'Cifra'));
      chordAction.disabled = !favorite.hasChords && !favorite.url;
      chordAction.addEventListener('click', () => openSongFavoriteCached(favorite, 'chords', chordAction));

      headActions.appendChild(spotifyAction);
      headActions.appendChild(youtubeAction);
      headActions.appendChild(lyricAction);
      headActions.appendChild(chordAction);

      head.appendChild(coverButton);
      head.appendChild(title);
      head.appendChild(headActions);
      item.appendChild(head);
      item.appendChild(meta);
      songFavoritesList.appendChild(item);
    });
    scheduleSongFavoritesLayoutSync();
  };

  const applySongFavorites = (favorites) => {
    const normalizedFavorites = Array.isArray(favorites)
      ? favorites.map(normalizeSongFavorite).filter((favorite) => Boolean(normalizeSongUrlKey(favorite.url)))
      : [];
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
    const previousCount = songFavorites.length;
    songFavorites = songFavorites.filter((item) => normalizeSongUrlKey(item.url) !== urlKey);
    if (songFavorites.length === previousCount) return false;
    rebuildSongFavoritesIndex();
    renderSongFavorites();
    applyFavoriteStateToRenderedButtons(urlKey, false);
    return true;
  };

  const saveSongFavorite = async (result, triggerButton, widget = null) => {
    const safeResult = asObject(result);
    const sourceUrl = (safeResult.url || '').trim();
    const urlKey = normalizeSongUrlKey(sourceUrl);
    if (!sourceUrl || !urlKey) {
      setSongFeedback(
        readSongMessage('favoriteSaveError', 'Não foi possível salvar o favorito.'),
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
      setFavoriteButtonState(triggerButton, true, true);
      setSongFeedback(
        readSongMessage('favoriteButtonRemoving', 'Removendo favorito...'),
        'is-loading',
        widget
      );
      try {
        const response = await fetch(`/api/songs/favorites?url=${encodeURIComponent(sourceUrl)}`, {
          method: 'DELETE',
        });
        const payload = asObject(await response.json().catch(() => ({})));
        if (!response.ok || !payload.ok) {
          const message = payload?.detail?.message
            || payload?.message
            || readSongMessage('favoriteRemoveError', 'Não foi possível remover o favorito.');
          throw new Error(message);
        }

        removeSongFavoriteByUrl(urlKey);
        setSongFeedback(
          readSongMessage('favoriteRemoveSuccess', 'Favorito removido.'),
          'is-success',
          widget
        );
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : readSongMessage('favoriteRemoveError', 'Não foi possível remover o favorito.');
        setSongFeedback(message, 'is-error', widget);
        setFavoriteButtonState(triggerButton, true, false);
      }
      return;
    }

    setFavoriteButtonState(triggerButton, false, true);
    setSongFeedback(
      readSongMessage('favoriteButtonSaving', 'Salvando favorito...'),
      'is-loading',
      widget
    );

    try {
      const externalQuery = buildExternalSongSearchQuery(safeResult);
      const response = await fetch('/api/songs/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: sourceUrl,
          title: safeResult.title || '',
          artist: safeResult.artist || '',
          source: safeResult.source || '',
          source_label: safeResult.source_label || '',
          image_url: safeResult.image_url || '',
          spotify_url: buildExternalSongSearchUrl('spotify', externalQuery),
          youtube_url: buildExternalSongSearchUrl('youtube', externalQuery),
        }),
      });

      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message
          || payload?.message
          || readSongMessage('favoriteSaveError', 'Não foi possível salvar o favorito.');
        throw new Error(message);
      }

      const savedFavorite = upsertSongFavorite(payload.favorite);
      if (savedFavorite) {
        const savedKey = normalizeSongUrlKey(savedFavorite.url);
        applyFavoriteStateToRenderedButtons(savedKey, true);
      }
      setSongFeedback(
        readSongMessage('favoriteSaveSuccess', 'Música salva nos favoritos.'),
        'is-success',
        widget
      );
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('favoriteSaveError', 'Não foi possível salvar o favorito.');
      setSongFeedback(message, 'is-error', widget);
      setFavoriteButtonState(triggerButton, false, false);
    }
  };

  const fetchSongFavorites = async () => {
    songFavoritesLoading = true;
    renderSongFavorites();
    try {
      const response = await fetch('/api/songs/favorites');
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload?.detail?.message
          || payload?.message
          || readSongMessage('favoritesLoadError', 'Não foi possível carregar os favoritos.')
        );
      }

      songFavoritesLoading = false;
      applySongFavorites(Array.isArray(payload.favorites) ? payload.favorites : []);
    } catch (err) {
      songFavoritesLoading = false;
      songFavorites = [];
      rebuildSongFavoritesIndex();
      renderSongFavorites();
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

    const response = await fetch('/api/songs/favorites/order', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ordered_ids: normalizedIds }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !responsePayload.ok) {
      const message = responsePayload?.detail?.message
        || responsePayload?.message
        || readSongMessage('favoritesReorderError', 'Não foi possível reordenar os favoritos.');
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
        readSongMessage('favoritesReorderSuccess', 'Ordem dos favoritos atualizada.'),
        'is-success'
      );
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('favoritesReorderError', 'Não foi possível reordenar os favoritos.');
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

  const fetchCustomSongs = async () => {
    try {
      const response = await fetch('/api/songs/custom');
      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        throw new Error(
          parseCustomSongApiError(
            payload,
            readSongMessage('customSongsLoadError', 'Não foi possível carregar músicas manuais.')
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
    }
  };

  const createCustomSongOnServer = async (payload) => {
    const response = await fetch('/api/songs/custom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongSaveError', 'Não foi possível salvar a música.')
        )
      );
    }
    return normalizeCustomSong(responsePayload.song);
  };

  const updateCustomSongOnServer = async (songId, payload) => {
    const safeSongId = String(songId || '').trim();
    if (!safeSongId) {
      throw new Error(readSongMessage('customSongSaveError', 'Não foi possível salvar a música.'));
    }

    const response = await fetch(`/api/songs/custom/${encodeURIComponent(safeSongId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongSaveError', 'Não foi possível salvar a música.')
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

    const response = await fetch('/api/songs/custom/order', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ordered_ids: normalizedIds }),
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongsReorderError', 'Não foi possível reordenar as músicas.')
        )
      );
    }
    return Array.isArray(responsePayload.songs)
      ? responsePayload.songs.map((song) => ({ ...normalizeCustomSong(song), isDraft: false }))
      : [];
  };

  const deleteCustomSongOnServer = async (songId) => {
    const safeSongId = String(songId || '').trim();
    if (!safeSongId) {
      throw new Error(readSongMessage('customSongRemoveError', 'Não foi possível remover a música.'));
    }

    const response = await fetch(`/api/songs/custom/${encodeURIComponent(safeSongId)}`, {
      method: 'DELETE',
    });
    const responsePayload = asObject(await response.json().catch(() => ({})));
    if (!response.ok || !responsePayload.ok) {
      throw new Error(
        parseCustomSongApiError(
          responsePayload,
          readSongMessage('customSongRemoveError', 'Não foi possível remover a música.')
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
          ? readSongMessage('customSongDraftSaved', 'Rascunho salvo automaticamente.')
          : readSongMessage('customSongDraftSaveError', 'Não foi possível salvar o rascunho.'),
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
      emptyItem.textContent = readSongMessage('customSongsEmpty', 'Nenhuma música manual adicionada ainda.');
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
      titleNode.textContent = song.title || readSongMessage('defaultSongTitle', 'Música');

      const headActions = document.createElement('div');
      headActions.className = 'song-favorite-head-actions custom-song-item-head-actions';

      const lyricAction = document.createElement('button');
      lyricAction.type = 'button';
      lyricAction.className = 'song-search-action song-favorite-head-action custom-song-item-head-action';
      lyricAction.classList.add('custom-song-item-head-action-lyrics');
      lyricAction.dataset.customSongAction = 'lyrics';
      lyricAction.dataset.customSongId = song.id;
      lyricAction.innerHTML = LYRICS_ACTION_ICON;
      lyricAction.title = readSongMessage('lyricsButton', 'Letra');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton', 'Letra'));
      lyricAction.disabled = !song.lyricsText.trim();

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action song-favorite-head-action custom-song-item-head-action';
      chordAction.classList.add('custom-song-item-head-action-chords');
      chordAction.dataset.customSongAction = 'chords';
      chordAction.dataset.customSongId = song.id;
      chordAction.innerHTML = CHORDS_ACTION_ICON;
      chordAction.title = readSongMessage('chordsButton', 'Cifra');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton', 'Cifra'));
      chordAction.disabled = !song.chordsText.trim();

      headActions.appendChild(lyricAction);
      headActions.appendChild(chordAction);
      head.appendChild(titleNode);
      head.appendChild(headActions);

      const metaNode = document.createElement('p');
      metaNode.className = 'custom-song-item-meta';
      const keyLabel = readSongMessage('customSongKeyLabel', 'Tom');
      const keyValue = song.key || '-';
      const lyricsLabel = readSongMessage('customSongLyricsTab', 'Música');
      const chordsLabel = readSongMessage('customSongChordsTab', 'Cifras');
      const draftLabel = song.isDraft ? readSongMessage('customSongDraftBadge', 'Rascunho') : '';
      metaNode.textContent = [draftLabel, `${keyLabel}: ${keyValue}`, `${lyricsLabel}: ${song.lyricsText.trim() ? 'OK' : '-'}`, `${chordsLabel}: ${song.chordsText.trim() ? 'OK' : '-'}`]
        .filter(Boolean)
        .join(' | ');

      const updatedNode = document.createElement('p');
      updatedNode.className = 'custom-song-item-updated';
      const updatedAt = formatCustomSongDateTime(song.updatedAtUtc || song.createdAtUtc);
      updatedNode.textContent = updatedAt
        ? `${readSongMessage('customSongUpdatedAt', 'Atualizado em')} (UTC): ${updatedAt}`
        : '';

      const actions = document.createElement('div');
      actions.className = 'custom-song-item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'custom-song-item-action';
      editBtn.dataset.customSongAction = 'edit';
      editBtn.dataset.customSongId = song.id;
      editBtn.textContent = readSongMessage('customSongEditButton', 'Editar');

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'custom-song-item-action';
      removeBtn.dataset.customSongAction = 'remove';
      removeBtn.dataset.customSongId = song.id;
      removeBtn.textContent = readSongMessage('customSongRemoveButton', 'Remover');

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
        ? readSongMessage('customSongEditModalTitle', 'Editar música manual')
        : readSongMessage('customSongModalTitle', 'Nova música manual');
    }
    if (customSongSaveBtn) {
      customSongSaveBtn.textContent = customSongEditingId
        ? readSongMessage('customSongUpdateButton', 'Atualizar música')
        : readSongMessage('customSongSaveButton', 'Salvar música');
    }

    const formPayload = draft
      ? { ...(normalizedSong || {}), ...draft }
      : (normalizedSong || { tab: CUSTOM_SONG_TAB_LYRICS });
    fillCustomSongForm(formPayload);
    setCustomSongDraftStatus(
      draft
        ? readSongMessage('customSongDraftRecovered', 'Rascunho recuperado.')
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
      setCustomSongDraftStatus(readSongMessage('customSongTitleRequired', 'Informe o título da música.'), 'is-error');
      showSongToast(readSongMessage('customSongTitleRequired', 'Informe o título da música.'), 'is-error');
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
          ? readSongMessage('customSongUpdateSuccess', 'Música manual atualizada.')
          : readSongMessage('customSongSaveSuccess', 'Música manual adicionada.'),
        'is-success'
      );
      closeCustomSongModal({ preserveDraft: false });
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongSaveError', 'Não foi possível salvar a música.');
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

    const safeTitle = targetSong.title || readSongMessage('defaultSongTitle', 'Música');
    const shouldRemove = await openFavoriteConfirmModal({
      triggerElement,
      songTitle: safeTitle,
      title: readSongMessage('customSongRemoveConfirmTitle', 'Inativar música'),
      message: readSongMessage('customSongRemoveConfirm', 'Deseja inativar "{title}"?', { title: safeTitle }),
      cancelLabel: readSongMessage('customSongRemoveConfirmCancel', 'Cancelar'),
      acceptLabel: readSongMessage('customSongRemoveConfirmAccept', 'Inativar'),
    });
    if (!shouldRemove) return;

    if (targetSong.isDraft) {
      customSongs = customSongs.filter((song) => song.id !== targetId);
      clearCustomSongDraft();
      renderCustomSongs();
      showSongToast(readSongMessage('customSongRemoveSuccess', 'Rascunho removido.'), 'is-success');
      return;
    }

    try {
      await deleteCustomSongOnServer(targetId);
      await fetchCustomSongs();
      showSongToast(readSongMessage('customSongRemoveSuccess', 'Música manual inativada.'), 'is-success');
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongRemoveError', 'Não foi possível remover a música.');
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
      showSongToast(readSongMessage('customSongsReorderSuccess', 'Ordem das músicas atualizada.'), 'is-success');
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : readSongMessage('customSongsReorderError', 'Não foi possível reordenar as músicas.');
      showSongToast(message, 'is-error');
      await fetchCustomSongs();
    } finally {
      customSongsReorderPending = false;
    }
  };

  customSongs = [];
  syncStoredCustomDraftToSongList();
  renderCustomSongs();
  await fetchCustomSongs();

  if (customSongsAddBtn) {
    customSongsAddBtn.addEventListener('click', () => {
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

  const syncSongFavoritesLayout = () => {
    if (!songFavoritesList) return;
    songFavoritesList.querySelectorAll('.song-favorite-item').forEach((item) => {
      syncSongFavoriteItemLayout(item);
    });
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
      avatar.alt = result.artist
        ? readSongMessage('avatarAltWithArtist', 'Foto de {artist}', { artist: result.artist })
        : readSongMessage('avatarAltFallback', 'Imagem da música');
      avatar.src = (result.image_url || '').trim() || songSearchFallbackImage;
      avatar.addEventListener('error', () => {
        avatar.src = songSearchFallbackImage;
      });

      const info = document.createElement('div');
      info.className = 'song-search-info';
      const title = document.createElement('strong');
      title.textContent = result.title || readSongMessage('defaultSongTitle', 'Música');
      const meta = document.createElement('p');
      const artist = (result.artist || '').trim();
      const sourceLabel = resolveSongSourceLabel(result.source, result.source_label || '');
      const singerPrefix = readSongMessage('singerPrefix', 'Cantor:');
      const sourcePrefix = readSongMessage('sourcePrefix', 'Fonte:');
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

      const spotifyAction = document.createElement('a');
      spotifyAction.className = 'song-search-action song-search-action-external';
      spotifyAction.classList.add('song-search-action-spotify');
      spotifyAction.innerHTML = SPOTIFY_ACTION_ICON;
      spotifyAction.title = readSongMessage('spotifyTitle', 'Abrir no Spotify');
      spotifyAction.setAttribute('aria-label', readSongMessage('spotifyAria', 'Abrir no Spotify'));
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
      youtubeAction.title = readSongMessage('youtubeTitle', 'Abrir no YouTube');
      youtubeAction.setAttribute('aria-label', readSongMessage('youtubeAria', 'Abrir no YouTube'));
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
      lyricAction.innerHTML = [
        LYRICS_ACTION_ICON,
        `<span class="song-search-action-label">${readSongMessage('lyricsButton', 'Letra')}</span>`
      ].join('');
      lyricAction.title = readSongMessage('lyricsButton', 'Letra');
      lyricAction.setAttribute('aria-label', readSongMessage('lyricsButton', 'Letra'));
      lyricAction.disabled = !result.title && !result.url;
      lyricAction.addEventListener('click', () => {
        loadLyricsFromService(result, lyricAction);
      });

      const chordAction = document.createElement('button');
      chordAction.type = 'button';
      chordAction.className = 'song-search-action';
      chordAction.classList.add('song-search-action-chords');
      chordAction.innerHTML = [
        CHORDS_ACTION_ICON,
        `<span class="song-search-action-label">${readSongMessage('chordsButton', 'Cifra')}</span>`
      ].join('');
      chordAction.title = readSongMessage('chordsButton', 'Cifra');
      chordAction.setAttribute('aria-label', readSongMessage('chordsButton', 'Cifra'));
      chordAction.disabled = !result.url;
      chordAction.addEventListener('click', () => {
        loadSongFromUrl(result.url || '', chordAction, result);
      });

      actions.appendChild(spotifyAction);
      actions.appendChild(youtubeAction);
      actions.appendChild(lyricAction);
      actions.appendChild(chordAction);
      actions.appendChild(favoriteAction);

      item.appendChild(main);
      item.appendChild(actions);
      activeWidget.resultsList.appendChild(item);
    });

    activeWidget.resultsContainer.hidden = false;
    hideSongSearchResultsExcept(activeWidget);
    scheduleSongSearchResultsLayoutSync(activeWidget);
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
        setFetchSubmitState(false, readSongMessage('searchButton', 'Buscar música'));
      }
      return;
    }

    if (query.length < SONG_SEARCH_MIN_CHARS) {
      clearSongSearchResults(activeWidget);
      hideSongSearchResultsExcept(activeWidget);
      setSongFeedback(
        readSongMessage('searchMinChars', 'Digite pelo menos {count} caracteres para buscar.', { count: SONG_SEARCH_MIN_CHARS }),
        '',
        activeWidget
      );
      if (!fromTyping) {
        setFetchSubmitState(false, readSongMessage('searchButton', 'Buscar música'));
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
        setSongFeedback(readSongMessage('searchNoResults', 'Nenhuma música encontrada para este nome.'), '', activeWidget);
      } else {
        renderSongSearchResults(cachedResults, activeWidget);
        const foundMessage = readSongMessage('searchResultsFound', '{count} opções encontradas.', { count: cachedResults.length });
        setSongFeedback(foundMessage, 'is-success', activeWidget);
      }
      if (!fromTyping) {
        setFetchSubmitState(false, readSongMessage('searchButton', 'Buscar música'));
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
      setFetchSubmitState(true, readSongMessage('searchButtonLoading', 'Buscando...'));
    }
    setSongFeedback(readSongMessage('searchingSources', 'Buscando músicas nos portais...'), 'is-loading', activeWidget);
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

      const payload = asObject(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) {
        const message = payload?.detail?.message || payload?.message || readSongMessage('searchErrorApi', 'Não foi possível buscar músicas agora.');
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
        setSongFeedback(readSongMessage('searchNoResults', 'Nenhuma música encontrada para este nome.'), '', activeWidget);
        return;
      }

      renderSongSearchResults(results, activeWidget);
      const foundMessage = readSongMessage('searchResultsFound', '{count} opções encontradas.', { count: results.length });
      setSongFeedback(foundMessage, 'is-success', activeWidget);
    } catch (err) {
      if (err && typeof err === 'object' && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : readSongMessage('searchError', 'Falha ao buscar músicas.');
      setSongFeedback(message, 'is-error', activeWidget);
    } finally {
      if (requestId === songSearchRequestId) {
        songSearchAbortController = null;
      }
      if (!fromTyping) {
        setFetchSubmitState(false, readSongMessage('searchButton', 'Buscar música'));
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

  if (songFavoritesList) {
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

  void fetchSongFavorites();

  if (songSearchWidgets.length) {
    window.addEventListener('resize', () => {
      scheduleSongSearchResultsLayoutSync();
      scheduleSongFavoritesLayoutSync();
    }, { passive: true });
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => {
        scheduleSongSearchResultsLayoutSync();
        scheduleSongFavoritesLayoutSync();
      }).catch(() => {});
    }

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
      const targetElement = target instanceof Element ? target : null;
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
        void executeSongSearch(query, { fromTyping: false, widget: cantosWidget });
        return;
      }

      const clickedInsideSongModal = Boolean(
        targetElement
        && songModal
        && targetElement.closest('#song-modal')
      );
      if (clickedInsideSongModal) return;
      const songModalIsOpen = Boolean(songModal && songModal.classList.contains('open'));
      if (songModalIsOpen) return;
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
      closeMainMenu();

      if (favoriteConfirmModal && favoriteConfirmModal.classList.contains('open')) {
        closeFavoriteConfirmModal(false);
        return;
      }

      if (customSongModal && customSongModal.classList.contains('open')) {
        closeCustomSongModal({ preserveDraft: true });
        return;
      }

      if (songModal && songModal.classList.contains('open')) {
        closeSongModal();
        return;
      }

      if (mysteryModal && mysteryModal.classList.contains('open')) {
        closeMysteryModal();
      }
    }
  });
})();

