// Azure DevOps Intelligence Hub - Master Controller & Blade Engine
window.BladeController = {
  currentData: null,
  activeTab: 'overview',
  tabRenderers: {},

  init() {
    const backdrop = document.getElementById('bladeBackdrop');
    const panel = document.getElementById('azureBladePanel');
    const closeBtn = document.getElementById('btnBladeClose');

    backdrop?.addEventListener('click', () => this.closeBlade());
    closeBtn?.addEventListener('click', () => this.closeBlade());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel?.classList.contains('active')) {
        this.closeBlade();
      }
    });

    // Tab buttons
    document.querySelectorAll('.blade-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Copy JSON Payload
    document.getElementById('btnBladeCopyJson')?.addEventListener('click', () => {
      if (this.currentData?.rawData) {
        navigator.clipboard.writeText(JSON.stringify(this.currentData.rawData, null, 2))
          .then(() => alert('Resource telemetry JSON copied to clipboard!'))
          .catch(() => alert('Unable to copy to clipboard.'));
      }
    });

    // Open in Azure DevOps
    document.getElementById('btnBladeOpenAdo')?.addEventListener('click', () => {
      if (this.currentData?.adoUrl) {
        window.open(this.currentData.adoUrl, '_blank', 'noopener,noreferrer');
      } else {
        const org = window.HubApp.getOrg();
        const project = document.getElementById('projectSelect')?.value || '';
        const url = project ? `https://dev.azure.com/${org}/${encodeURIComponent(project)}` : `https://dev.azure.com/${org}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  },

  openBlade(config) {
    this.currentData = config;
    this.tabRenderers = config.renderers || {};

    const panel = document.getElementById('azureBladePanel');
    const backdrop = document.getElementById('bladeBackdrop');

    // Set Header Data
    document.getElementById('bladeTitle').textContent = config.title || 'Resource Details';
    document.getElementById('bladeSubtitle').textContent = config.subtitle || 'Azure DevOps Telemetry';
    
    if (config.iconSvg) {
      document.getElementById('bladeTitleIcon').innerHTML = config.iconSvg;
    }

    const crumbProject = document.getElementById('bladeCrumbProject');
    const crumbCategory = document.getElementById('bladeCrumbCategory');
    if (crumbProject) crumbProject.textContent = config.breadcrumbProject || 'Project';
    if (crumbCategory) crumbCategory.textContent = config.breadcrumbResource || 'Resource';

    // Show/Hide Tabs based on config
    const showStages = !!this.tabRenderers.stages;
    const showLogs = !!this.tabRenderers.logs;
    
    document.getElementById('bladeTabStages')?.classList.toggle('hidden', !showStages);
    document.getElementById('bladeTabLogs')?.classList.toggle('hidden', !showLogs);

    // Set Dynamic Ambient Background Watermark
    const bladeWatermark = document.getElementById('bladeWatermarkBg');
    if (bladeWatermark) {
      const activeView = window.HubApp?.currentView || '';
      const iconMap = {
        dashboard: 'assets/icons/dashboard.png',
        repositories: 'assets/icons/repositories.png',
        policies: 'assets/icons/policies.png',
        prs: 'assets/icons/prs.png',
        pipelines: 'assets/icons/pipelines.png',
        agentpools: 'assets/icons/agentpools.png',
        serviceconnections: 'assets/icons/serviceconnections.png',
        access: 'assets/icons/access.png',
        activity: 'assets/icons/activity.png',
        workitems: 'assets/icons/workitems.png'
      };
      const cat = `${config.breadcrumbResource || ''} ${activeView || ''}`.toLowerCase();
      let iconUrl = iconMap[activeView] || '';
      if (!iconUrl) {
        if (cat.includes('repo') || cat.includes('branch')) iconUrl = iconMap.repositories;
        else if (cat.includes('polic')) iconUrl = iconMap.policies;
        else if (cat.includes('pr') || cat.includes('pull')) iconUrl = iconMap.prs;
        else if (cat.includes('pipe') || cat.includes('build') || cat.includes('run')) iconUrl = iconMap.pipelines;
        else if (cat.includes('access') || cat.includes('security') || cat.includes('permission') || cat.includes('group')) iconUrl = iconMap.access;
        else if (cat.includes('activity') || cat.includes('commit')) iconUrl = iconMap.activity;
        else if (cat.includes('agent') || cat.includes('pool') || cat.includes('queue')) iconUrl = iconMap.agentpools;
        else if (cat.includes('service') || cat.includes('connection')) iconUrl = iconMap.serviceconnections;
        else if (cat.includes('work') || cat.includes('item') || cat.includes('backlog')) iconUrl = iconMap.workitems;
        else if (cat.includes('dash')) iconUrl = iconMap.dashboard;
      }
      if (iconUrl) {
        bladeWatermark.style.backgroundImage = `url('${iconUrl}')`;
        bladeWatermark.style.display = 'block';
      } else {
        bladeWatermark.style.display = 'none';
      }
    }

    this.switchTab('overview');

    backdrop?.classList.add('active');
    panel?.classList.add('active');
    panel?.setAttribute('aria-hidden', 'false');
  },

  closeBlade() {
    const panel = document.getElementById('azureBladePanel');
    const backdrop = document.getElementById('bladeBackdrop');

    panel?.classList.remove('active');
    backdrop?.classList.remove('active');
    panel?.setAttribute('aria-hidden', 'true');
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.blade-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });

    const body = document.getElementById('bladeBody');
    if (!body) return;

    if (tabId === 'raw') {
      const jsonStr = this.currentData?.rawData ? JSON.stringify(this.currentData.rawData, null, 2) : '{\n  "status": "No raw telemetry payload available"\n}';
      body.innerHTML = `
        <div class="blade-section">
          <div class="blade-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            Raw Azure Resource JSON
          </div>
          <div class="log-console-wrapper">
            <div class="log-console-header">
              <span>application/json</span>
              <span>UTF-8</span>
            </div>
            <pre class="log-console-content">${this.escapeHtml(jsonStr)}</pre>
          </div>
        </div>
      `;
      return;
    }

    if (this.tabRenderers[tabId]) {
      body.innerHTML = this.tabRenderers[tabId]();
    } else {
      body.innerHTML = `
        <div class="blade-section">
          <p class="text-muted" style="font-size:13px;">No telemetry content available for tab "${tabId}".</p>
        </div>
      `;
    }
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};

// Main Hub Application
window.HubApp = {
  chart: null,
  cachedRepos: [],
  cachedProjects: [],
  currentUser: null,
  isOrgAdmin: false,
  chartType: 'bar',
  currentTheme: 'light',
  currentView: 'dashboard',
  currentData: { labels: [], values: [], label: '' },

  viewConfigs: {
    dashboard: {
      title: 'Executive Intelligence Hub',
      subtitle: 'Unified repository matrix, branch policies, CI/CD telemetry and security analysis',
      cardTitle: 'Telemetry & Insights Overview',
      path: '/dev.azure.com/overview',
      substepId: null
    },
    repositories: {
      title: 'Repositories & Active Branch Matrix',
      subtitle: 'Inspect Git repositories, active branches, commit recency, and branch health flags',
      cardTitle: 'Repositories & Branches',
      path: '/dev.azure.com/repositories',
      substepId: 'substepRepo'
    },
    policies: {
      title: 'Branch Policy Enforcement & Governance',
      subtitle: 'Review branch protection rules, required reviewers, and automated build gates',
      cardTitle: 'Policy Enforcement Rules',
      path: '/dev.azure.com/policies',
      substepId: 'substepRepo'
    },
    prs: {
      title: 'Pull Requests Matrix',
      subtitle: 'Monitor active, completed, and abandoned pull requests across all repositories',
      cardTitle: 'Pull Requests',
      path: '/dev.azure.com/pullrequests',
      substepId: 'substepRepo'
    },
    pipelines: {
      title: 'Pipeline Builds & Release Deployment Matrix',
      subtitle: 'Inspect CI/CD pipeline runs, linked release environments, and gate statuses',
      cardTitle: 'Build & Release Runs',
      path: '/dev.azure.com/pipelines',
      substepId: 'substepPipelines'
    },
    agentpools: {
      title: 'Project Agent Pools & Queues',
      subtitle: 'Audit Microsoft-hosted and self-hosted private compute pools',
      cardTitle: 'Agent Pools & Queues',
      path: '/dev.azure.com/agentpools',
      substepId: 'substepAgentPools'
    },
    serviceconnections: {
      title: 'Service Connections & Cloud Endpoints',
      subtitle: 'Inspect cloud endpoint authorizations, service principals, and ARM scopes',
      cardTitle: 'Service Connections',
      path: '/dev.azure.com/serviceconnections',
      substepId: 'substepServiceConnections'
    },
    access: {
      title: 'Project Security Groups, Roles & Member Permissions',
      subtitle: 'Inspect security identities, explicit roles, and group memberships',
      cardTitle: 'Security Groups & Permissions',
      path: '/dev.azure.com/security',
      substepId: 'substepAccess'
    },
    activity: {
      title: 'User Activity & Commit History',
      subtitle: 'Track commit activity, timeline frequency, and code contribution',
      cardTitle: 'Commit History & Changes',
      path: '/dev.azure.com/activity',
      substepId: 'substepActivity'
    },
    workitems: {
      title: 'Active Work Items & Backlog Status',
      subtitle: 'Inspect agile backlog items, assigned bugs, and sprint status',
      cardTitle: 'Work Items & Backlog',
      path: '/dev.azure.com/workitems',
      substepId: 'substepWorkItems'
    }
  },

  init() {
    window.BladeController.init();
    this.initTheme();
    this.bindEvents();
    this.bindProjectPickerEvents();
    this.goToScreen(1);

    if (localStorage.getItem('ado_saved') === 'true') {
      const chk = document.getElementById('chkRememberCreds');
      if (chk) chk.checked = true;
      const org = document.getElementById('targetOrg');
      const pat = document.getElementById('targetPat');
      if (org) org.value = localStorage.getItem('ado_org') || '';
      if (pat) pat.value = localStorage.getItem('ado_pat') || '';
      this.updateOrgPath();
    }
  },

  initTheme() {
    const savedTheme = localStorage.getItem('hub_theme') || 'light';
    this.setTheme(savedTheme);

    const themeToggleBtn = document.getElementById('btnThemeToggle');
    themeToggleBtn?.addEventListener('click', () => {
      const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
      this.setTheme(nextTheme);
    });
  },

  setTheme(themeName) {
    this.currentTheme = themeName;
    localStorage.setItem('hub_theme', themeName);

    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(`theme-${themeName}`);

    const iconSpan = document.getElementById('themeToggleIcon');
    const textSpan = document.getElementById('themeToggleText');

    if (themeName === 'dark') {
      if (iconSpan) iconSpan.textContent = '☀️';
      if (textSpan) textSpan.textContent = 'Light Mode';
    } else {
      if (iconSpan) iconSpan.textContent = '🌙';
      if (textSpan) textSpan.textContent = 'Dark Mode';
    }

    // Re-render chart if active
    if (this.currentData.labels.length) {
      this.renderChart(this.currentData.labels, this.currentData.values, this.currentData.label);
    }

    // Re-render dashboard pipeline monthly chart if active
    if (window.DashboardModule && window.DashboardModule.pipelineMonthlyChart && window.DashboardModule.updatePipelineMonthlyView) {
      window.DashboardModule.updatePipelineMonthlyView();
    }
  },

  bindEvents() {
    const self = this;
    
    // Sidebar toggle (collapse / expand)
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
      document.getElementById('appLayout')?.classList.toggle('sidebar-collapsed');
    });

    // Step Navigation
    document.getElementById('btnStartWizard')?.addEventListener('click', () => self.goToScreen(2));
    document.getElementById('btnBackToStep1')?.addEventListener('click', () => self.goToScreen(1));
    document.getElementById('btnSwitchOrg')?.addEventListener('click', () => self.goToScreen(2));
    document.getElementById('btnLogout')?.addEventListener('click', () => self.goToScreen(2));
    document.getElementById('btnLogoHome')?.addEventListener('click', () => self.goToScreen(1));

    document.getElementById('targetOrg')?.addEventListener('input', () => self.updateOrgPath());
    document.getElementById('btnConnect')?.addEventListener('click', () => self.connectAndGoToStep3());
    document.getElementById('projectSelect')?.addEventListener('change', () => self.handleProjectSelect());
    document.getElementById('btnModalClose')?.addEventListener('click', () => self.closeModal());

    // Sidebar Navigation Links
    document.querySelectorAll('.portal-sidebar .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) {
          self.switchView(view);
          if (view === 'dashboard') {
            self.execDashboardFetch();
          }
        }
      });
    });

    // Step 5 Execution Buttons
    document.getElementById('btnInspectRepo')?.addEventListener('click', () => self.execRepoInspect());
    document.getElementById('btnFetchAccess')?.addEventListener('click', () => self.execAccessFetch());
    document.getElementById('btnFetchActivity')?.addEventListener('click', () => self.execActivityFetch());
    document.getElementById('btnFetchPipelines')?.addEventListener('click', () => self.execPipelineFetch());
    document.getElementById('btnFetchWorkItems')?.addEventListener('click', () => self.execWorkItemsFetch());
    document.getElementById('btnFetchAgentPools')?.addEventListener('click', () => self.execAgentPoolsFetch());
    document.getElementById('btnFetchServiceConnections')?.addEventListener('click', () => self.execServiceConnectionsFetch());

    // Pagination / "See More" Buttons
    document.getElementById('btnMoreRepos')?.addEventListener('click', () => window.RepoModule.renderBranches(true));
    document.getElementById('btnMorePrs')?.addEventListener('click', () => window.RepoModule.renderPrs(true));
    document.getElementById('btnMoreAccess')?.addEventListener('click', () => window.AccessModule.render(true));
    document.getElementById('btnMoreCommits')?.addEventListener('click', () => window.ActivityModule.renderCommits(true));
    document.getElementById('btnMorePipelines')?.addEventListener('click', () => window.PipelinesModule.render(true));
    document.getElementById('btnMoreWorkItems')?.addEventListener('click', () => window.WorkItemsModule.render(true));
    document.getElementById('btnMoreAgentPools')?.addEventListener('click', () => window.AgentPoolsModule.render(true));
    document.getElementById('btnMoreServiceConnections')?.addEventListener('click', () => window.ServiceConnectionModule.render(true));

    // Quick Action Bar Buttons in Card Header
    document.getElementById('btnQuickInspect')?.addEventListener('click', () => {
      if (self.currentView === 'pipelines') {
        self.execPipelineFetch();
      } else {
        self.triggerActiveInspect();
      }
    });
    document.getElementById('btnOpenAdoPortal')?.addEventListener('click', () => {
      const org = self.getOrg();
      const project = document.getElementById('projectSelect')?.value || '';
      const url = project ? `https://dev.azure.com/${org}/${encodeURIComponent(project)}` : `https://dev.azure.com/${org}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Azure DevOps Dashboard Widget Controls
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', () => self.execDashboardFetch());
    document.getElementById('btnEditDashboard')?.addEventListener('click', () => self.showModal('Dashboard editing mode enabled. You can rearrange and customize Azure DevOps widgets.'));
    document.getElementById('btnDashSettings')?.addEventListener('click', () => self.showModal('Dashboard Settings: Connected to Azure DevOps Live REST API v7.1.'));
    document.getElementById('btnDashFullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Query Tiles Quick Navigation
    document.getElementById('tileActiveTasks')?.addEventListener('click', () => {
      self.switchView('workitems');
      self.triggerActiveInspect();
    });
    document.getElementById('tileReadyTesting')?.addEventListener('click', () => {
      self.switchView('workitems');
      self.triggerActiveInspect();
    });
    document.getElementById('tileCompletedStories')?.addEventListener('click', () => {
      self.switchView('pipelines');
      self.triggerActiveInspect();
    });
    document.getElementById('tileOpenStories')?.addEventListener('click', () => {
      self.switchView('workitems');
      self.triggerActiveInspect();
    });
    document.getElementById('tileActiveBugs')?.addEventListener('click', () => {
      self.switchView('workitems');
      self.triggerActiveInspect();
    });
    document.getElementById('tileSprintCapacity')?.addEventListener('click', () => {
      self.switchView('pipelines');
      self.triggerActiveInspect();
    });

    // Feedback Modal Handlers
    document.getElementById('btnOpenFeedback')?.addEventListener('click', () => {
      document.getElementById('feedbackModal')?.classList.remove('hidden');
    });
    document.getElementById('btnFeedbackCancel')?.addEventListener('click', () => {
      document.getElementById('feedbackModal')?.classList.add('hidden');
    });
    document.getElementById('btnFeedbackSubmit')?.addEventListener('click', () => {
      document.getElementById('feedbackModal')?.classList.add('hidden');
      alert('Thank you for your feedback! It has been submitted.');
    });

    // Chart Switchers
    document.querySelectorAll('.btn-chart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-chart').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        self.chartType = e.currentTarget.dataset.chart;
        self.renderChart(self.currentData.labels, self.currentData.values, self.currentData.label);
      });
    });

    // Instant Search filter
    document.getElementById('tableFilterInput')?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('#mainDashboard tbody tr').forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });

    // Exports
    document.getElementById('btnExportCSV')?.addEventListener('click', () => self.exportActiveCSV());
    document.getElementById('btnExportAccessXlsx')?.addEventListener('click', () => self.exportAccessXLSX());
  },

  goToScreen(stepNumber) {
    document.getElementById('screen-step1')?.classList.toggle('hidden', stepNumber !== 1);
    document.getElementById('screen-step2')?.classList.toggle('hidden', stepNumber !== 2);
    document.getElementById('screen-step3')?.classList.toggle('hidden', stepNumber !== 3);
    
    if (stepNumber !== 3) {
      this.isOrgAdmin = false;
      this.currentUser = null;
      this.cachedProjects = [];
    }

    const isStep3 = stepNumber === 3;
    document.getElementById('portalSidebar')?.classList.toggle('hidden', !isStep3);
    document.getElementById('btnToggleSidebar')?.classList.toggle('hidden', !isStep3);
    document.getElementById('btnSwitchOrg')?.classList.toggle('hidden', !isStep3);
    document.getElementById('btnLogout')?.classList.toggle('hidden', !isStep3);
    document.getElementById('suiteEnvBadge')?.classList.toggle('hidden', !isStep3);

    window.BladeController.closeBlade();
  },

  getOrg() {
    return document.getElementById('targetOrg')?.value.trim().replace(/^https?:\/\//, '').replace(/^dev\.azure\.com\//, '').split('/')[0] || '';
  },

  getPat() {
    return document.getElementById('targetPat')?.value.trim() || '';
  },

  updateOrgPath() {
    const org = this.getOrg();
    const link = document.getElementById('generatedUrlLink');
    if (link) {
      link.href = org ? `https://dev.azure.com/${org}` : 'javascript:void(0)';
      link.textContent = org ? `https://dev.azure.com/${org}` : 'https://dev.azure.com/';
    }
  },

  async fetchAdo(org, path, auth) {
    const res = await fetch(`https://dev.azure.com/${org}/${path}`, {
      headers: { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  },

  showModal(msg) {
    document.getElementById('modalMessage').textContent = msg;
    document.getElementById('validationModal')?.classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('validationModal')?.classList.add('hidden');
  },

  setStatus(msg, type = 'info') {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    bar.textContent = msg;
    bar.className = `status-banner status-${type}`;
    bar.classList.remove('hidden');
  },

  setKpis(scope, l2, v2, l3, v3, l4, v4) {
    const k1 = document.getElementById('kpi-1-val');
    const k2l = document.getElementById('kpi-2-label');
    const k2v = document.getElementById('kpi-2-val');
    const k3l = document.getElementById('kpi-3-label');
    const k3v = document.getElementById('kpi-3-val');
    const k4l = document.getElementById('kpi-4-label');
    const k4v = document.getElementById('kpi-4-val');

    if (k1) k1.textContent = scope;
    if (k2l) k2l.textContent = l2;
    if (k2v) k2v.textContent = v2;
    if (k3l) k3l.textContent = l3;
    if (k3v) k3v.textContent = v3;
    if (k4l) k4l.textContent = l4;
    if (k4v) k4v.textContent = v4;
  },

  async getAuthenticatedUser(org, auth) {
    try {
      const data = await this.fetchAdo(org, '_apis/connectionData?api-version=7.1-preview.1', auth);
      const user = data.authenticatedUser || data.authorizedUser || {};
      const userId = user.id || '';
      let descriptor = user.descriptor || user.subjectDescriptor || '';

      // If descriptor is an identity descriptor (like Microsoft.IdentityModel.Claims...), attempt to resolve Graph descriptor
      let graphDescriptor = '';
      if (descriptor.startsWith('aad.') || descriptor.startsWith('msa.')) {
        graphDescriptor = descriptor;
      } else if (userId) {
        try {
          const descRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/descriptors/${encodeURIComponent(userId)}?api-version=7.1-preview.1`, {
            headers: { 'Authorization': auth, 'Accept': 'application/json' }
          });
          if (descRes.ok) {
            const descData = await descRes.json();
            graphDescriptor = descData.value || '';
          }
        } catch (_) {}
      }

      return {
        id: userId,
        displayName: user.providerDisplayName || user.customDisplayName || '',
        email: (user.mailAddress || user.uniqueName || '').toLowerCase(),
        descriptor: descriptor,
        graphDescriptor: graphDescriptor,
        isOrgAdmin: false
      };
    } catch (e) {
      console.warn('Could not query _apis/connectionData:', e);
      return null;
    }
  },

  isUserAuthorizedForProject(projectName) {
    if (!projectName) return false;
    // Organization administrators have complete access to all projects in the organization
    if (this.isOrgAdmin) return true;
    const clean = projectName.trim().toLowerCase();
    return (this.cachedProjects || []).some(p => p.name.trim().toLowerCase() === clean);
  },

  async isOrganizationAdministrator(org, auth, user) {
    if (!user) return false;

    // Strategy 1: Check via Identities API with queryMembership=Expanded (Direct & handles nested AAD/security groups)
    try {
      const endpoints = [
        `https://vssps.dev.azure.com/${org}/_apis/identities?searchFilter=General&filterValue=Project%20Collection%20Administrators&queryMembership=Expanded&api-version=7.1-preview.1`,
        `https://dev.azure.com/${org}/_apis/identities?searchFilter=General&filterValue=Project%20Collection%20Administrators&queryMembership=Expanded&api-version=7.1-preview.1`
      ];

      for (const idUrl of endpoints) {
        try {
          const idRes = await fetch(idUrl, {
            headers: { 'Authorization': auth, 'Accept': 'application/json' }
          });
          if (idRes.ok) {
            const idData = await idRes.json();
            const pcaIdentities = (idData.value || []).filter(item => {
              const dName = (item.providerDisplayName || item.customDisplayName || item.displayName || '').toLowerCase();
              const aName = (item.properties?.AccountName?.$value || '').toLowerCase();
              return dName.includes('project collection administrators') || aName.includes('project collection administrators');
            });

            for (const pca of pcaIdentities) {
              const members = pca.members || pca.memberIds || [];
              if (user.id && members.some(m => String(m).toLowerCase() === String(user.id).toLowerCase())) {
                console.info(`[Auth] User ${user.displayName || user.id} verified as Organization Administrator via Identities API.`);
                return true;
              }
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[Auth] Identities check notice:', e);
    }

    // Strategy 2: Check via Graph API (Project Collection Administrators Group Memberships)
    try {
      const groupsUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/groups?api-version=7.1-preview.1`;
      const gRes = await fetch(groupsUrl, {
        headers: { 'Authorization': auth, 'Accept': 'application/json' }
      });
      if (gRes.ok) {
        const gData = await gRes.json();
        const pcaGroup = (gData.value || []).find(g => {
          const dName = (g.displayName || '').trim().toLowerCase();
          const pName = (g.principalName || '').trim().toLowerCase();
          return dName === 'project collection administrators' ||
                 dName === 'organization administrators' ||
                 pName.endsWith('\\project collection administrators') ||
                 pName.endsWith('\\organization administrators');
        });

        if (pcaGroup && pcaGroup.descriptor) {
          // 2a. Check upward from user graph descriptor if available
          let userGraphDescriptor = user.graphDescriptor || user.descriptor || '';
          if (!userGraphDescriptor.startsWith('aad.') && !userGraphDescriptor.startsWith('msa.')) {
            try {
              const descRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/descriptors/${encodeURIComponent(user.id)}?api-version=7.1-preview.1`, {
                headers: { 'Authorization': auth, 'Accept': 'application/json' }
              });
              if (descRes.ok) {
                const descData = await descRes.json();
                userGraphDescriptor = descData.value || '';
              }
            } catch (_) {}
          }

          if (userGraphDescriptor) {
            try {
              const upRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/memberships/${encodeURIComponent(userGraphDescriptor)}?direction=up&api-version=7.1-preview.1`, {
                headers: { 'Authorization': auth, 'Accept': 'application/json' }
              });
              if (upRes.ok) {
                const upData = await upRes.json();
                const parentDescriptors = (upData.value || []).map(m => m.containerDescriptor);
                if (parentDescriptors.includes(pcaGroup.descriptor)) {
                  console.info(`[Auth] User ${user.displayName || user.id} verified as Organization Administrator via Graph upward membership.`);
                  return true;
                }
              }
            } catch (_) {}
          }

          // 2b. Check downward from PCA group descriptor
          try {
            const downRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/memberships/${encodeURIComponent(pcaGroup.descriptor)}?direction=down&api-version=7.1-preview.1`, {
              headers: { 'Authorization': auth, 'Accept': 'application/json' }
            });
            if (downRes.ok) {
              const downData = await downRes.json();
              const memberDescriptors = new Set((downData.value || []).map(m => m.memberDescriptor));

              if (userGraphDescriptor && memberDescriptors.has(userGraphDescriptor)) {
                console.info(`[Auth] User ${user.displayName || user.id} verified as Organization Administrator via Graph downward descriptor match.`);
                return true;
              }

              // Also check direct user identities inside PCA
              for (const mDesc of Array.from(memberDescriptors).slice(0, 40)) {
                try {
                  const uRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/users/${encodeURIComponent(mDesc)}?api-version=7.1-preview.1`, {
                    headers: { 'Authorization': auth, 'Accept': 'application/json' }
                  });
                  if (uRes.ok) {
                    const uData = await uRes.json();
                    const uMail = (uData.mailAddress || uData.principalName || '').toLowerCase();
                    const uName = (uData.displayName || '').toLowerCase();
                    if ((user.email && uMail === user.email) ||
                        (user.displayName && uName === user.displayName.toLowerCase())) {
                      console.info(`[Auth] User ${user.displayName} verified as Organization Administrator via Graph PCA member match.`);
                      return true;
                    }
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[Auth] Graph API admin check notice:', e);
    }

    // Strategy 3: Check via User Entitlements API
    if (user && user.id) {
      try {
        const entUrl = `https://vsaex.dev.azure.com/${org}/_apis/userentitlements/${encodeURIComponent(user.id)}?api-version=7.1-preview.4`;
        const entRes = await fetch(entUrl, {
          headers: { 'Authorization': auth, 'Accept': 'application/json' }
        });
        if (entRes.ok) {
          const entData = await entRes.json();
          const isPcaAssignment = (entData.groupAssignments || []).some(ga => {
            const gName = (ga.group?.displayName || ga.group?.principalName || '').toLowerCase();
            return gName.includes('project collection administrators') || gName.includes('organization administrators');
          });
          if (isPcaAssignment) {
            console.info(`[Auth] User ${user.displayName || user.id} verified as Organization Administrator via User Entitlements.`);
            return true;
          }
        }
      } catch (e) {
        console.warn('[Auth] User Entitlements admin check notice:', e);
      }
    }

    // Strategy 4: Check via Security Permissions (Collection root permission)
    try {
      const secUrl = `https://dev.azure.com/${org}/_apis/permissions/3e65f728-f8bc-4ecd-adc8-7f5816b6c227/1?tokens=$&alwaysAllowAdministrators=true&api-version=7.1-preview.1`;
      const secRes = await fetch(secUrl, {
        headers: { 'Authorization': auth, 'Accept': 'application/json' }
      });
      if (secRes.ok) {
        const secData = await secRes.json();
        if (secData.value === true || (Array.isArray(secData.value) && secData.value[0] === true)) {
          console.info(`[Auth] User ${user.displayName || user.id} verified as Organization Administrator via Security HasPermissions.`);
          return true;
        }
      }
    } catch (_) {}

    return false;
  },

  async resolveAuthorizedProjects(org, auth, allProjects, user) {
    const authorizedNames = new Set();

    // Strategy 1: Fast Graph API Check - Upward memberships across all projects
    let userGraphDescriptor = user?.graphDescriptor || user?.descriptor || '';
    if (user && user.id && (!userGraphDescriptor.startsWith('aad.') && !userGraphDescriptor.startsWith('msa.'))) {
      try {
        const descRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/descriptors/${encodeURIComponent(user.id)}?api-version=7.1-preview.1`, {
          headers: { 'Authorization': auth, 'Accept': 'application/json' }
        });
        if (descRes.ok) {
          const descData = await descRes.json();
          userGraphDescriptor = descData.value || '';
        }
      } catch (_) {}
    }

    if (userGraphDescriptor) {
      try {
        const upRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/memberships/${encodeURIComponent(userGraphDescriptor)}?direction=up&api-version=7.1-preview.1`, {
          headers: { 'Authorization': auth, 'Accept': 'application/json' }
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          const containerDescriptors = (upData.value || []).map(m => m.containerDescriptor);
          
          if (containerDescriptors.length > 0) {
            // Resolve project-scoped group names matching format [ProjectName]\GroupName
            await Promise.all(containerDescriptors.slice(0, 30).map(async (cDesc) => {
              try {
                const gRes = await fetch(`https://vssps.dev.azure.com/${org}/_apis/graph/groups/${encodeURIComponent(cDesc)}?api-version=7.1-preview.1`, {
                  headers: { 'Authorization': auth, 'Accept': 'application/json' }
                });
                if (gRes.ok) {
                  const gInfo = await gRes.json();
                  const pName = gInfo.principalName || '';
                  const match = pName.match(/^\[(.*?)\]\\/);
                  if (match && match[1]) {
                    authorizedNames.add(match[1].trim().toLowerCase());
                  }
                }
              } catch (_) {}
            }));
          }
        }
      } catch (err) {
        console.warn('[Auth] Graph membership upward scan notice:', err);
      }
    }

    // Strategy 2: Organization-level user teams query ($mine=true)
    try {
      const teamsData = await this.fetchAdo(org, '_apis/teams?$mine=true&$top=500&api-version=7.1-preview.3', auth);
      const teams = teamsData.value || [];
      teams.forEach(t => {
        if (t.projectName) authorizedNames.add(t.projectName.trim().toLowerCase());
        if (t.projectId) {
          const match = allProjects.find(p => p.id === t.projectId || p.name === t.projectId);
          if (match) authorizedNames.add(match.name.trim().toLowerCase());
        }
      });
    } catch (err) {
      console.warn('[Auth] Organization-level $mine teams query notice:', err);
    }

    // Strategy 3: User Entitlements API (projectEntitlements)
    if (user && user.id) {
      try {
        const entUrl = `https://vsaex.dev.azure.com/${org}/_apis/userentitlements/${encodeURIComponent(user.id)}?api-version=7.1-preview.4`;
        const entRes = await fetch(entUrl, {
          headers: { 'Authorization': auth, 'Accept': 'application/json' }
        });
        if (entRes.ok) {
          const entData = await entRes.json();
          (entData.projectEntitlements || []).forEach(pe => {
            if (pe.projectRef?.name) authorizedNames.add(pe.projectRef.name.trim().toLowerCase());
          });
        }
      } catch (entErr) {
        console.warn('[Auth] User entitlements query notice:', entErr);
      }
    }

    // Strategy 4: Project-scoped teams query ($mine=true) and explicit team member matching
    const uncheckedProjects = allProjects.filter(p => !authorizedNames.has(p.name.trim().toLowerCase()));
    if (uncheckedProjects.length > 0) {
      await Promise.all(uncheckedProjects.map(async (p) => {
        try {
          // Check if current user has any team in this project
          const projTeams = await this.fetchAdo(org, `_apis/projects/${encodeURIComponent(p.name)}/teams?$mine=true&api-version=6.0`, auth);
          if (projTeams && projTeams.value && projTeams.value.length > 0) {
            authorizedNames.add(p.name.trim().toLowerCase());
            return;
          }

          // Check if current user's email/name/id is an explicit member in project teams
          if (user && (user.email || user.displayName || user.id)) {
            const allTeams = await this.fetchAdo(org, `_apis/projects/${encodeURIComponent(p.name)}/teams?$mine=false&$top=10&api-version=6.0`, auth);
            for (const team of (allTeams.value || [])) {
              try {
                const memData = await this.fetchAdo(org, `_apis/projects/${encodeURIComponent(p.name)}/teams/${encodeURIComponent(team.id || team.name)}/members?api-version=6.0`, auth);
                const isMember = (memData.value || []).some(m => {
                  const id = m.identity || m;
                  const mEmail = (id.uniqueName || id.mailAddress || '').toLowerCase();
                  const mName = (id.displayName || id.name || '').toLowerCase();
                  return (user.email && mEmail === user.email) ||
                         (user.displayName && mName === user.displayName.toLowerCase()) ||
                         (user.id && (id.id === user.id || m.id === user.id));
                });
                if (isMember) {
                  authorizedNames.add(p.name.trim().toLowerCase());
                  break;
                }
              } catch (_) {}
            }
          }
        } catch (projErr) {
          console.warn(`[Auth] Project "${p.name}" membership check notice:`, projErr.message);
        }
      }));
    }

    // Filter allProjects strictly to ONLY those projects where the user is an authorized member
    return allProjects.filter(p => authorizedNames.has(p.name.trim().toLowerCase()));
  },

  async connectAndGoToStep3() {
    const org = this.getOrg();
    const pat = this.getPat();
    if (!org || !pat) return this.showModal('Please enter both Organization Name and Personal Access Token (PAT).');

    if (document.getElementById('chkRememberCreds')?.checked) {
      localStorage.setItem('ado_saved', 'true');
      localStorage.setItem('ado_org', org);
      localStorage.setItem('ado_pat', pat);
    }

    const btn = document.getElementById('btnConnect');
    if (btn) {
      btn.innerHTML = `<span class="pulse-dot pulse-blue"></span> Authenticating...`;
      btn.disabled = true;
    }

    try {
      const auth = 'Basic ' + btoa(':' + pat);
      
      // 1. Resolve Authenticated Identity
      this.currentUser = await this.getAuthenticatedUser(org, auth);
      const userName = this.currentUser?.displayName || 'User';

      // 2. Discover All Projects in Organization
      const data = await this.fetchAdo(org, '_apis/projects?api-version=7.1-preview.1&$top=500', auth);
      const allProjects = (data.value || []).sort((a, b) => a.name.localeCompare(b.name));

      // 3. Verify Organization Administrator privileges
      this.setStatus(`Verifying administrative privileges for ${userName}...`, 'info');
      const isOrgAdmin = await this.isOrganizationAdministrator(org, auth, this.currentUser);
      this.isOrgAdmin = isOrgAdmin;
      if (this.currentUser) this.currentUser.isOrgAdmin = isOrgAdmin;

      let projects = [];
      if (isOrgAdmin) {
        console.info(`[Auth] User "${userName}" is an Organization Administrator (Project Collection Administrator). Full access to all ${allProjects.length} organization projects granted.`);
        this.cachedProjects = allProjects;
        projects = allProjects;
      } else {
        console.info(`[Auth] User "${userName}" is a standard user. Resolving provided/assigned projects only...`);
        this.setStatus(`Resolving provided projects for ${userName}...`, 'info');
        this.cachedProjects = await this.resolveAuthorizedProjects(org, auth, allProjects, this.currentUser);
        projects = this.cachedProjects;
      }

      // 4. Populate Project Select with authorized projects
      const select = document.getElementById('projectSelect');
      if (select) {
        if (projects.length > 0) {
          select.innerHTML = '<option value="">-- Choose Project --</option>' +
            projects.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
          select.disabled = false;
        } else {
          select.innerHTML = '<option value="">-- No Authorized Projects --</option>';
          select.disabled = true;
        }
      }

      this.populateDashboardProjectMenu();

      const orgCrumb = document.getElementById('suiteBreadcrumbOrg');
      if (orgCrumb) orgCrumb.textContent = `dev.azure.com/${org}`;

      const orgCode = document.getElementById('portalOrgCode');
      if (orgCode) orgCode.textContent = `dev.azure.com/${org}`;
      
      const connText = document.getElementById('suiteConnectionText');
      if (connText) {
        if (isOrgAdmin) {
          connText.innerHTML = `<span class="portal-role-tag org-admin-tag" title="Organization Administrator: Full access to all projects">👑 Org Admin</span> ${userName} (${projects.length} Projects)`;
        } else {
          connText.innerHTML = `<span class="portal-role-tag user-tag" title="Project Member: Access restricted to assigned projects">👤 Member</span> ${userName} (${projects.length} Assigned Project${projects.length === 1 ? '' : 's'})`;
        }
      }

      this.goToScreen(3);
      this.switchView('dashboard');
      if (window.DashboardModule) window.DashboardModule.reset();

      if (isOrgAdmin) {
        this.setStatus(`Authenticated as ${userName} (Organization Administrator). All ${projects.length} organization project${projects.length === 1 ? '' : 's'} are accessible.`, 'success');
      } else if (projects.length === 0) {
        this.setStatus(`Access Notice: No assigned project memberships found for ${userName}. Please contact your organization administrator to be added as a project member.`, 'warning');
      } else {
        this.setStatus(`Authenticated as ${userName}. Found ${projects.length} assigned project${projects.length === 1 ? '' : 's'}. Only projects provided to your account are accessible.`, 'success');
        
        // If regular user belongs to only 1 project, auto-select it immediately for seamless UX
        if (projects.length === 1 && select) {
          select.value = projects[0].name;
          await this.handleProjectSelect();
        }
      }
    } catch (e) {
      this.showModal(`Azure DevOps Authentication Error: ${e.message}`);
    } finally {
      if (btn) {
        btn.innerHTML = `Connect Workspace <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
        btn.disabled = false;
      }
    }
  },

  async handleProjectSelect() {
    const project = document.getElementById('projectSelect')?.value || '';
    
    // Security check: Verify project authorization before proceeding
    if (project && !this.isUserAuthorizedForProject(project)) {
      this.showModal(`Access Denied: You are not an authorized member of project "${project}". You only have permission to view projects you are assigned to.`);
      const select = document.getElementById('projectSelect');
      if (select) select.value = this.cachedProjects[0]?.name || '';
      return;
    }

    const activeLabel = document.getElementById('activeProjectLabel');
    if (activeLabel) activeLabel.textContent = project || 'Select Project';

    const projCrumb = document.getElementById('suiteBreadcrumbProject');
    if (projCrumb) projCrumb.textContent = project || 'Overview';

    // Sync dashboard team name header
    const teamNameEl = document.getElementById('azDashTeamName');
    if (teamNameEl) teamNameEl.textContent = project ? `${project} Team` : 'Select a Project';

    this.populateDashboardProjectMenu();

    if (!project) {
      if (window.DashboardModule) window.DashboardModule.reset();
      this.setStatus('Please select an Azure DevOps Project from the dropdown above.', 'info');
      return;
    }

    this.setStatus(`Active Project set to: ${project}`, 'info');

    // Pre-fetch repos for the selected project
    try {
      const auth = 'Basic ' + btoa(':' + this.getPat());
      const data = await this.fetchAdo(this.getOrg(), `${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1-preview.1`, auth);
      this.cachedRepos = data.value || [];
      this.cachedRepos.sort((a, b) => a.name.localeCompare(b.name));

      const repoDropdown = document.getElementById('repoSelect');
      if (repoDropdown) {
        repoDropdown.innerHTML = '<option value="">-- Choose Repository --</option>' +
          '<option value="-- All Repositories --">-- All Repositories --</option>' +
          this.cachedRepos.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
      }
    } catch (err) {
      console.warn('Repository caching notice:', err);
    }

    // Reset data tables to placeholder prompts for the newly selected project
    this.resetTablePlaceholders();

    // Auto-inspect or refresh currently selected view (dashboard only)
    this.switchView(this.currentView, true);
  },

  resetTablePlaceholders() {
    const repoDropdown = document.getElementById('repoSelect');
    if (repoDropdown) repoDropdown.value = '';

    const setHtml = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    setHtml('branchesTableBody', `
      <tr>
        <td colspan="7" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Select a repository scope and click <strong>"Trigger / Inspect Repositories"</strong> button above to load branch details.
        </td>
      </tr>
    `);

    setHtml('policyTableBody', `
      <tr>
        <td colspan="6" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          Select a repository scope and click <strong>"Trigger / Inspect Policies"</strong> button above to load branch policies.
        </td>
      </tr>
    `);

    setHtml('repoPrsTableBody', `
      <tr>
        <td colspan="6" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>
          Select a repository scope and click <strong>"Trigger / Inspect PRs"</strong> button above to load pull requests.
        </td>
      </tr>
    `);

    setHtml('accessTableBody', `
      <tr>
        <td colspan="5" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
          Specify a user query (or leave blank for all) and click <strong>"Trigger / Scan Members"</strong> button above to load permissions.
        </td>
      </tr>
    `);

    setHtml('userCommitsTableBody', `
      <tr>
        <td colspan="5" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Enter a user email and timeframe, then click <strong>"Trigger / Search Activity"</strong> button above to load commit history.
        </td>
      </tr>
    `);

    setHtml('userPrTableBody', `
      <tr>
        <td colspan="5" style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No pull request activity loaded. Click <strong>"Trigger / Search Activity"</strong> button above to inspect.
        </td>
      </tr>
    `);

    setHtml('pipelineTableBody', `
      <tr>
        <td colspan="8" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Select your Runs Scope and click <strong>"Trigger / Fetch Runs"</strong> button above to load pipeline details.
        </td>
      </tr>
    `);

    setHtml('workItemsTableBody', `
      <tr>
        <td colspan="6" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          Specify an assigned user (or leave blank for all) and click <strong>"Trigger / Query Work Items"</strong> button above to load backlog items.
        </td>
      </tr>
    `);

    setHtml('agentPoolsTableBody', `
      <tr>
        <td colspan="6" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect></svg>
          Select a pool type and click <strong>"Trigger / Scan Agent Pools"</strong> button above to load agent pools & queues.
        </td>
      </tr>
    `);

    setHtml('serviceConnectionsTableBody', `
      <tr>
        <td colspan="6" style="padding: 40px 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin: 0 auto 10px; display: block; color: var(--azure-blue);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          Select a service type and click <strong>"Trigger / Scan Endpoints"</strong> button above to load service connections.
        </td>
      </tr>
    `);

    [
      'seeMoreRepoContainer',
      'seeMoreRepoPrsContainer',
      'seeMoreAccessContainer',
      'seeMoreCommitsContainer',
      'seeMorePipelinesContainer',
      'seeMoreWorkItemsContainer',
      'seeMoreAgentPoolsContainer',
      'seeMoreServiceConnectionsContainer'
    ].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  },

  switchView(viewKey, forceReload = false) {
    this.currentView = viewKey;
    const config = this.viewConfigs[viewKey] || this.viewConfigs.dashboard;

    // Update Sidebar active state
    document.querySelectorAll('.portal-sidebar .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewKey);
    });

    // Update Page Header & Card Header
    const pageTitle = document.getElementById('portalPageTitle');
    const pageSubtitle = document.getElementById('portalPageSubtitle');
    const cardTitle = document.getElementById('cardTabTitle');
    const activePath = document.getElementById('portalActivePath');

    const project = document.getElementById('projectSelect')?.value || '';
    const org = this.getOrg() || 'dev.azure.com';

    if (pageTitle) pageTitle.textContent = config.title;
    if (pageSubtitle) pageSubtitle.textContent = config.subtitle;
    if (cardTitle) cardTitle.textContent = config.cardTitle;
    if (activePath) {
      activePath.textContent = project ? `/dev.azure.com/${org}/${project}/${viewKey}` : `/dev.azure.com/${org}/${viewKey}`;
    }

    // Update Step 5 substep filters
    const filterContainer = document.getElementById('step5Container');
    if (filterContainer) {
      if (config.substepId) {
        filterContainer.classList.remove('hidden');
        ['substepRepo', 'substepAccess', 'substepActivity', 'substepPipelines', 'substepWorkItems', 'substepAgentPools', 'substepServiceConnections'].forEach(id => {
          document.getElementById(id)?.classList.toggle('hidden', id !== config.substepId);
        });

        // Contextual trigger button label for shared repo substep
        const btnRepoText = document.getElementById('btnInspectRepoText');
        if (btnRepoText) {
          if (viewKey === 'policies') {
            btnRepoText.textContent = 'Trigger / Inspect Policies';
          } else if (viewKey === 'prs') {
            btnRepoText.textContent = 'Trigger / Inspect PRs';
          } else {
            btnRepoText.textContent = 'Trigger / Inspect Repositories';
          }
        }
      } else {
        filterContainer.classList.add('hidden');
      }
    }

    // Show corresponding section in main dashboard
    const allViews = [
      'view-dashboard',
      'view-repositories',
      'view-policies',
      'view-prs',
      'view-access',
      'view-activity',
      'view-pipelines',
      'view-workitems',
      'view-agentpools',
      'view-serviceconnections'
    ];

    allViews.forEach(id => {
      document.getElementById(id)?.classList.toggle('hidden', id !== `view-${viewKey}`);
    });

    // Trigger auto-fetch ONLY when on dashboard overview
    if (project && forceReload && this.currentView === 'dashboard') {
      this.triggerActiveInspect();
    }
  },

  validateProjectSelection() {
    const project = document.getElementById('projectSelect')?.value;
    if (!project) {
      this.showModal('Please select an Azure DevOps Project first using the Project selector.');
      return null;
    }
    if (!this.isUserAuthorizedForProject(project)) {
      this.showModal(`Access Denied: You are not an authorized member of project "${project}". You only have permission to view projects you are assigned to.`);
      return null;
    }
    return project;
  },

  triggerActiveInspect() {
    const project = this.validateProjectSelection();
    if (!project) return;

    switch (this.currentView) {
      case 'overallwork':
        this.execOverallWorkFetch();
        break;
      case 'repositories':
      case 'policies':
      case 'prs':
        this.execRepoInspect();
        break;
      case 'access':
        this.execAccessFetch();
        break;
      case 'activity':
        this.execActivityFetch();
        break;
      case 'pipelines':
        this.execPipelineFetch();
        break;
      case 'workitems':
        this.execWorkItemsFetch();
        break;
      case 'agentpools':
        this.execAgentPoolsFetch();
        break;
      case 'serviceconnections':
        this.execServiceConnectionsFetch();
        break;
      case 'dashboard':
        this.execDashboardFetch();
        break;
    }
  },

  async execRepoInspect() {
    const project = this.validateProjectSelection();
    if (!project) return;

    const repoInput = document.getElementById('repoSelect')?.value;
    if (!repoInput) {
      return this.showModal('Please select a Repository from the Repository Scope dropdown before clicking Trigger.');
    }

    try {
      this.setStatus('Inspecting repository branches and branch policies...', 'info');
      await window.RepoModule.inspect(
        this.getOrg(),
        project,
        this.getPat(),
        repoInput,
        this.cachedRepos,
        this.currentView
      );
      this.setStatus('Repository matrix & branch policies loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execAccessFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Scanning security groups and identities...', 'info');
      await window.AccessModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('targetAccessUserQuery')?.value.trim() || ''
      );
      this.setStatus('Security groups & permissions loaded successfully.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execActivityFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Scanning user activity and commit history...', 'info');
      if (!this.cachedRepos.length) {
        const auth = 'Basic ' + btoa(':' + this.getPat());
        const data = await this.fetchAdo(this.getOrg(), `${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1-preview.1`, auth);
        this.cachedRepos = data.value || [];
      }
      await window.ActivityModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('targetUserQuery')?.value.trim() || '',
        parseInt(document.getElementById('userTimeframeDays')?.value || '90', 10),
        this.cachedRepos
      );
      this.setStatus('User commit activity and PRs loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execPipelineFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Fetching pipeline runs & linked release deployments...', 'info');
      await window.PipelineModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('pipelineRunsTop')?.value || '50',
        document.getElementById('pipelineDeploymentFilter')?.value || 'all'
      );
      this.setStatus('Pipeline build & release deployment metrics loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execWorkItemsFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Querying work items with WIQL engine...', 'info');
      await window.WorkItemModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('targetWorkItemUser')?.value.trim() || ''
      );
      this.setStatus('Work items & backlog status loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execAgentPoolsFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Scanning agent pools & queues for project...', 'info');
      await window.AgentPoolModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('agentPoolTypeSelect')?.value || 'all'
      );
      this.setStatus('Agent pools & infrastructure telemetry loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  async execServiceConnectionsFetch() {
    const project = this.validateProjectSelection();
    if (!project) return;
    try {
      this.setStatus('Scanning service connections & endpoints for project...', 'info');
      await window.ServiceConnectionModule.fetch(
        this.getOrg(),
        project,
        this.getPat(),
        document.getElementById('scTypeSelect')?.value || 'all',
        document.getElementById('targetScQuery')?.value.trim() || ''
      );
      this.setStatus('Service connections & cloud integrations loaded.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },



  async execDashboardFetch() {
    const project = document.getElementById('projectSelect')?.value;
    if (!project) {
      if (window.DashboardModule) window.DashboardModule.reset();
      this.setStatus('Please select an Azure DevOps Project from the dropdown above to load the Dashboard.', 'warning');
      return;
    }
    if (!this.isUserAuthorizedForProject(project)) {
      if (window.DashboardModule) window.DashboardModule.reset();
      this.setStatus(`Access Denied: You are not an authorized member of project "${project}".`, 'error');
      return;
    }
    try {
      this.setStatus('Loading Azure DevOps Widget Dashboard...', 'info');
      await window.DashboardModule.init(
        this.getOrg(),
        project,
        this.getPat()
      );
      this.setStatus('Azure DevOps Widget Dashboard loaded successfully.', 'success');
    } catch (e) { this.setStatus(e.message, 'error'); }
  },

  renderChart(labels, values, label) {
    this.currentData = { labels, values, label };
    const chartCanvas = document.getElementById('analyticsChart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    if (this.chart) this.chart.destroy();

    const isDark = this.currentTheme === 'dark';
    const isPie = this.chartType === 'pie';

    const executivePalette = ['#0078d4', '#107c10', '#0284c7', '#7c3aed', '#ea580c', '#d13438', '#059669', '#64748b'];
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(40, 54, 72, 0.4)' : 'rgba(203, 213, 225, 0.5)';

    this.chart = new Chart(ctx, {
      type: this.chartType,
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [{
          label,
          data: values.length ? values : [0],
          backgroundColor: isPie ? executivePalette : '#0078d4',
          borderColor: isPie ? (isDark ? '#16202b' : '#ffffff') : '#005a9e',
          borderWidth: isPie ? 2 : 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPie,
            labels: { color: textColor, font: { family: 'Segoe UI', size: 11.5, weight: '600' } }
          }
        },
        scales: isPie ? {} : {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              maxRotation: 20,
              minRotation: 15,
              font: { family: 'Segoe UI', size: 11, weight: '600' }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              stepSize: 1,
              font: { family: 'Segoe UI', size: 11, weight: '600' }
            }
          }
        }
      }
    });
  },

  exportAccessXLSX() {
    if (!window.AccessModule?.items || !window.AccessModule.items.length) {
      alert('No permissions data available to export.');
      return;
    }
    const exportData = window.AccessModule.items.map(r => ({
      'Project': r.ProjectName,
      'Security Group Name': r.GroupName,
      'Role': r.GroupRole,
      'User Display Name': r.UserDisplayName,
      'User Principal / Email': r.MailAddress || r.UserPrincipal
    }));

    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, 'Permissions');
      XLSX.writeFile(wb, `${document.getElementById('projectSelect')?.value || 'Project'}_Permissions.xlsx`);
    } else {
      this.exportActiveCSV();
    }
  },

  exportActiveCSV() {
    const visibleTable = document.querySelector('#mainDashboard section:not(.hidden) table') || document.querySelector('#mainDashboard table');
    if (!visibleTable) return;
    let csv = [];
    visibleTable.querySelectorAll('tr').forEach(row => {
      let cols = [];
      row.querySelectorAll('th, td').forEach(c => cols.push(`"${c.innerText.replace(/"/g, '""')}"`));
      csv.push(cols.join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AzureDevOps_Export_${Date.now()}.csv`;
    a.click();
  },

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  bindProjectPickerEvents() {
    const self = this;
    const picker = document.getElementById('azDashTeamPicker');
    const menu = document.getElementById('azDashProjectMenu');
    const searchInput = document.getElementById('azDashProjectSearch');

    picker?.addEventListener('click', (e) => {
      e.stopPropagation();
      self.toggleDashboardProjectMenu();
    });

    document.getElementById('btnBannerSelectProject')?.addEventListener('click', (e) => {
      e.stopPropagation();
      self.openDashboardProjectMenu();
    });

    searchInput?.addEventListener('click', (e) => e.stopPropagation());
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#azDashProjectList .az-dash-project-item').forEach(item => {
        const name = (item.dataset.project || '').toLowerCase();
        item.style.display = !q || name.includes(q) ? 'flex' : 'none';
      });
    });

    document.addEventListener('click', (e) => {
      if (!menu?.contains(e.target) && !picker?.contains(e.target)) {
        self.closeDashboardProjectMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu?.classList.contains('hidden')) {
        self.closeDashboardProjectMenu();
      }
    });
  },

  toggleDashboardProjectMenu() {
    const menu = document.getElementById('azDashProjectMenu');
    if (menu?.classList.contains('hidden')) {
      this.openDashboardProjectMenu();
    } else {
      this.closeDashboardProjectMenu();
    }
  },

  openDashboardProjectMenu() {
    const menu = document.getElementById('azDashProjectMenu');
    const picker = document.getElementById('azDashTeamPicker');
    const searchInput = document.getElementById('azDashProjectSearch');

    this.populateDashboardProjectMenu();
    menu?.classList.remove('hidden');
    picker?.classList.add('active');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 50);
    }
  },

  closeDashboardProjectMenu() {
    const menu = document.getElementById('azDashProjectMenu');
    const picker = document.getElementById('azDashTeamPicker');
    menu?.classList.add('hidden');
    picker?.classList.remove('active');
  },

  populateDashboardProjectMenu() {
    const listEl = document.getElementById('azDashProjectList');
    if (!listEl) return;

    const currentProject = document.getElementById('projectSelect')?.value || '';
    const projects = this.cachedProjects || [];

    if (projects.length === 0) {
      listEl.innerHTML = `<div class="az-dash-project-empty">No authorized projects found for your account.</div>`;
      return;
    }

    const self = this;
    const scopeHeader = this.isOrgAdmin
      ? `<div class="az-dash-project-scope-header admin-scope">👑 Organization Admin (${projects.length} Projects)</div>`
      : `<div class="az-dash-project-scope-header user-scope">👤 Assigned Projects (${projects.length})</div>`;

    const html = scopeHeader + projects.map(p => {
      const isSelected = p.name === currentProject;
      return `
        <div class="az-dash-project-item ${isSelected ? 'selected' : ''}" data-project="${self.escapeHtml(p.name)}">
          <svg class="az-dash-project-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span class="az-dash-project-item-name" title="${self.escapeHtml(p.name)}">${self.escapeHtml(p.name)}</span>
          ${isSelected ? '<span class="az-dash-project-item-check">✓</span>' : ''}
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.az-dash-project-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const projName = item.dataset.project;
        const select = document.getElementById('projectSelect');
        if (select) {
          select.value = projName;
        }
        self.closeDashboardProjectMenu();
        self.handleProjectSelect();
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', () => window.HubApp.init());
