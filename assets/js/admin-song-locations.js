(() => {
  const STORAGE_KEY = 'song_locations_admin_password_v1';
  const LOGIN_ENDPOINT = '/api/admin/login';
  const TREE_ENDPOINT = '/api/admin/song-locations';
  const NODE_ENDPOINT = '/api/admin/song-locations/nodes';

  const loginCard = document.getElementById('admin-login-card');
  const panelCard = document.getElementById('admin-panel-card');
  const loginForm = document.getElementById('admin-login-form');
  const loginSubmit = document.getElementById('admin-login-submit');
  const passwordInput = document.getElementById('admin-password-input');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const statusNode = document.getElementById('admin-status');
  const addForm = document.getElementById('admin-add-form');
  const addSubmit = document.getElementById('admin-add-submit');
  const refreshBtn = document.getElementById('admin-refresh-btn');
  const parentSelect = document.getElementById('admin-parent-select');
  const labelInput = document.getElementById('admin-node-label');
  const treeNode = document.getElementById('admin-tree');
  const treeEmptyNode = document.getElementById('admin-tree-empty');

  let adminPassword = '';
  let loadingTree = false;
  let treeRoots = [];

  const asObject = (value) => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  );

  const setStatus = (message = '', type = '') => {
    if (!statusNode) return;
    statusNode.textContent = String(message || '').trim();
    statusNode.classList.remove('is-error', 'is-success', 'is-warning');
    if (type) statusNode.classList.add(type);
  };

  const isAuthenticated = () => Boolean(String(adminPassword || '').trim());

  const setUiLocked = (locked) => {
    const disabled = Boolean(locked);
    if (loginSubmit) loginSubmit.disabled = disabled;
    if (addSubmit) addSubmit.disabled = disabled;
    if (refreshBtn) refreshBtn.disabled = disabled;
    if (logoutBtn) logoutBtn.disabled = disabled;
    if (parentSelect) parentSelect.disabled = disabled;
    if (labelInput) labelInput.disabled = disabled;
  };

  const setAuthState = (authenticated) => {
    if (loginCard) loginCard.hidden = authenticated;
    if (panelCard) panelCard.hidden = !authenticated;
    if (!authenticated && passwordInput instanceof HTMLElement) {
      window.requestAnimationFrame(() => {
        passwordInput.focus();
      });
    }
  };

  const readApiError = async (response, fallbackMessage) => {
    let payload = {};
    try {
      payload = asObject(await response.json());
    } catch (err) {
      payload = {};
    }
    return (
      payload?.detail?.message
      || payload?.message
      || fallbackMessage
    );
  };

  const normalizeNode = (rawNode) => {
    const node = asObject(rawNode);
    const id = String(node.node_id || node.nodeId || node.id || '').trim();
    const label = String(node.label || '').trim();
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const children = rawChildren
      .map((child) => normalizeNode(child))
      .filter((child) => child && child.id);
    return {
      id,
      label,
      children,
    };
  };

  const flattenNodesForSelect = (nodes, parentPath = [], result = []) => {
    if (!Array.isArray(nodes)) return result;
    nodes.forEach((node) => {
      if (!node || !node.id) return;
      const nextPath = [...parentPath, node.label];
      result.push({
        id: node.id,
        path: nextPath,
      });
      flattenNodesForSelect(node.children, nextPath, result);
    });
    return result;
  };

  const populateParentSelect = () => {
    if (!parentSelect) return;
    const previousValue = String(parentSelect.value || '').trim();
    parentSelect.innerHTML = '';

    const rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = 'Raiz';
    parentSelect.appendChild(rootOption);

    const flatNodes = flattenNodesForSelect(treeRoots);
    flatNodes.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.path.join(' / ');
      parentSelect.appendChild(option);
    });

    if (
      previousValue
      && Array.from(parentSelect.options).some((option) => option.value === previousValue)
    ) {
      parentSelect.value = previousValue;
    } else {
      parentSelect.value = '';
    }
  };

  const focusAddFormWithParent = (parentId = '') => {
    if (parentSelect) {
      const safeParentId = String(parentId || '').trim();
      if (Array.from(parentSelect.options).some((option) => option.value === safeParentId)) {
        parentSelect.value = safeParentId;
      } else {
        parentSelect.value = '';
      }
    }
    if (labelInput instanceof HTMLElement) {
      window.requestAnimationFrame(() => {
        labelInput.focus();
        labelInput.select();
      });
    }
  };

  const renderTreeNodes = (nodes) => {
    const list = document.createElement('ul');
    nodes.forEach((node) => {
      if (!node || !node.id) return;
      const item = document.createElement('li');
      item.className = 'admin-tree-item';

      const row = document.createElement('div');
      row.className = 'admin-tree-row';
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const childList = hasChildren ? renderTreeNodes(node.children) : null;
      if (childList) {
        childList.hidden = true;
      }

      const labelText = document.createElement('span');
      labelText.className = 'admin-tree-label-text';
      labelText.textContent = node.label || 'Sem nome';

      let labelNode = null;
      if (hasChildren) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-tree-label admin-tree-toggle';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-label', `Exibir filhos de "${node.label || 'Sem nome'}"`);

        const caret = document.createElement('span');
        caret.className = 'admin-tree-caret';
        caret.setAttribute('aria-hidden', 'true');
        toggleBtn.appendChild(caret);
        toggleBtn.appendChild(labelText);

        const meta = document.createElement('span');
        meta.className = 'admin-tree-meta';
        meta.textContent = `(${node.children.length} filho(s))`;
        toggleBtn.appendChild(meta);

        toggleBtn.addEventListener('click', () => {
          if (!childList) return;
          const nextExpanded = toggleBtn.getAttribute('aria-expanded') !== 'true';
          toggleBtn.setAttribute('aria-expanded', String(nextExpanded));
          toggleBtn.setAttribute(
            'aria-label',
            `${nextExpanded ? 'Ocultar' : 'Exibir'} filhos de "${node.label || 'Sem nome'}"`
          );
          item.classList.toggle('is-expanded', nextExpanded);
          childList.hidden = !nextExpanded;
        });
        labelNode = toggleBtn;
      } else {
        const label = document.createElement('span');
        label.className = 'admin-tree-label';
        label.appendChild(labelText);
        labelNode = label;
      }
      row.appendChild(labelNode);

      const addChildBtn = document.createElement('button');
      addChildBtn.type = 'button';
      addChildBtn.className = 'admin-tree-action admin-tree-action-add';
      addChildBtn.textContent = '+ Filho';
      addChildBtn.addEventListener('click', () => {
        focusAddFormWithParent(node.id);
      });
      row.appendChild(addChildBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'admin-tree-action admin-tree-action-delete';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.addEventListener('click', async () => {
        deleteBtn.disabled = true;
        setStatus(`Removendo "${node.label}"...`);
        try {
          const response = await fetch(`${NODE_ENDPOINT}/${encodeURIComponent(node.id)}`, {
            method: 'DELETE',
            headers: {
              'X-Admin-Password': adminPassword,
            },
          });
          if (!response.ok) {
            throw new Error(await readApiError(response, 'Nao foi possivel excluir o item.'));
          }
          const payload = asObject(await response.json().catch(() => ({})));
          const removedCount = Number(payload.count) || 0;
          const assignmentCleanup = asObject(payload.assignment_cleanup);
          const removedAssignments = Number(assignmentCleanup.count) || 0;
          await loadTree({ silentStatus: true });
          setStatus(
            `Exclusao definitiva concluida. Itens removidos: ${removedCount}. Vinculos removidos: ${removedAssignments}.`,
            'is-success'
          );
        } catch (err) {
          setStatus(
            err instanceof Error ? err.message : 'Nao foi possivel excluir o item.',
            'is-error'
          );
        } finally {
          deleteBtn.disabled = false;
        }
      });
      row.appendChild(deleteBtn);

      item.appendChild(row);

      if (childList) {
        item.appendChild(childList);
      }

      list.appendChild(item);
    });
    return list;
  };

  const renderTree = () => {
    if (!treeNode || !treeEmptyNode) return;
    treeNode.innerHTML = '';
    if (!Array.isArray(treeRoots) || !treeRoots.length) {
      treeEmptyNode.hidden = false;
      return;
    }
    treeEmptyNode.hidden = true;
    treeNode.appendChild(renderTreeNodes(treeRoots));
  };

  const handleForbidden = () => {
    adminPassword = '';
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // no-op
    }
    setAuthState(false);
    setUiLocked(false);
    setStatus('Sessao expirada. Faca login novamente.', 'is-warning');
  };

  const loadTree = async (options = {}) => {
    if (!isAuthenticated() || loadingTree) return;
    const silentStatus = Boolean(asObject(options).silentStatus);
    loadingTree = true;
    setUiLocked(true);
    try {
      const response = await fetch(`${TREE_ENDPOINT}?include_inactive=false`, {
        method: 'GET',
        headers: {
          'X-Admin-Password': adminPassword,
        },
      });
      if (response.status === 403) {
        handleForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Nao foi possivel carregar a arvore.'));
      }
      const payload = asObject(await response.json().catch(() => ({})));
      const rawTree = Array.isArray(payload.tree) ? payload.tree : [];
      treeRoots = rawTree
        .map((node) => normalizeNode(node))
        .filter((node) => node && node.id);
      populateParentSelect();
      renderTree();
      if (!silentStatus) {
        const count = Number(payload.count) || 0;
        setStatus(`Arvore carregada. Itens ativos: ${count}.`, 'is-success');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Nao foi possivel carregar a arvore.', 'is-error');
    } finally {
      setUiLocked(false);
      loadingTree = false;
    }
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const typedPassword = String(passwordInput?.value || '').trim();
      if (!typedPassword) {
        setStatus('Informe a senha para entrar.', 'is-warning');
        return;
      }

      setUiLocked(true);
      try {
        const response = await fetch(LOGIN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            password: typedPassword,
          }),
        });
        if (!response.ok) {
          throw new Error(await readApiError(response, 'Senha invalida.'));
        }

        adminPassword = typedPassword;
        try {
          window.sessionStorage.setItem(STORAGE_KEY, adminPassword);
        } catch (err) {
          // no-op
        }
        if (passwordInput) {
          passwordInput.value = '';
        }
        setAuthState(true);
        await loadTree();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Falha ao autenticar.', 'is-error');
      } finally {
        setUiLocked(false);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      adminPassword = '';
      treeRoots = [];
      if (treeNode) treeNode.innerHTML = '';
      if (treeEmptyNode) treeEmptyNode.hidden = true;
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        // no-op
      }
      setAuthState(false);
      setStatus('Sessao encerrada.');
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      void loadTree();
    });
  }

  if (addForm) {
    addForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!isAuthenticated()) {
        setStatus('Faca login para adicionar itens.', 'is-warning');
        return;
      }

      const label = String(labelInput?.value || '').trim();
      const parentId = String(parentSelect?.value || '').trim();
      if (!label) {
        setStatus('Informe o nome do item.', 'is-warning');
        if (labelInput instanceof HTMLElement) labelInput.focus();
        return;
      }

      setUiLocked(true);
      setStatus('Adicionando item...');
      try {
        const response = await fetch(NODE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword,
          },
          body: JSON.stringify({
            parent_id: parentId || '',
            label,
          }),
        });
        if (response.status === 403) {
          handleForbidden();
          return;
        }
        if (!response.ok) {
          throw new Error(await readApiError(response, 'Nao foi possivel adicionar o item.'));
        }
        if (labelInput) {
          labelInput.value = '';
        }
        await loadTree({ silentStatus: true });
        setStatus('Item adicionado com sucesso.', 'is-success');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Nao foi possivel adicionar o item.', 'is-error');
      } finally {
        setUiLocked(false);
      }
    });
  }

  let restoredPassword = '';
  try {
    restoredPassword = String(window.sessionStorage.getItem(STORAGE_KEY) || '').trim();
  } catch (err) {
    restoredPassword = '';
  }

  if (restoredPassword) {
    adminPassword = restoredPassword;
    setAuthState(true);
    void loadTree();
  } else {
    setAuthState(false);
  }
})();
