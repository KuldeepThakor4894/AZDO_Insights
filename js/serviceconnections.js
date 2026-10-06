// Azure DevOps Intelligence Hub - Project-Wise Service Connections Module
window.ServiceConnectionModule = {
  endpoints: [],
  index: 0,
  pageSize: 25,
  currentProject: '',
  currentOrg: '',

  async fetch(org, project, pat, filterType, query) {
    this.currentOrg = org;
    this.currentProject = project;
    const auth = 'Basic ' + btoa(':' + pat);
    const cleanProject = project.trim();
    const typeFilter = (filterType || 'all').toLowerCase();
    const searchFilter = (query || '').trim().toLowerCase();

    window.HubApp.setStatus(`Scanning service connections for project "${cleanProject}"...`, 'info');

    let allEndpoints = [];

    // 1. Fetch Service Endpoints for the Project
    try {
      const endpointsUrl = `${encodeURIComponent(cleanProject)}/_apis/serviceendpoint/endpoints?includeFailed=true&includeDetails=true&api-version=7.1-preview.4`;
      const data = await window.HubApp.fetchAdo(org, endpointsUrl, auth);
      allEndpoints = data.value || [];
    } catch (err) {
      console.warn('Service endpoints v7.1 query notice, attempting fallback v6.0:', err);
      try {
        const fallbackUrl = `${encodeURIComponent(cleanProject)}/_apis/serviceendpoint/endpoints?api-version=6.0`;
        const fbData = await window.HubApp.fetchAdo(org, fallbackUrl, auth);
        allEndpoints = fbData.value || [];
      } catch (fbErr) {
        console.error('Failed to query service connections:', fbErr);
        throw new Error(`Service Connection Query Error: ${fbErr.message}. Ensure PAT has "Service Connections (Read)" scope.`);
      }
    }

    // 2. Process and sanitize endpoint records
    const processed = allEndpoints.map((e, idx) => {
      const rawType = (e.type || 'generic').toLowerCase();
      const rawScheme = e.authorization?.scheme || 'None';
      const isReady = e.isReady !== false;

      // Extract metadata
      const dataMap = e.data || {};
      const subscriptionName = dataMap.subscriptionName || dataMap.subscriptionId || '';
      const tenantId = dataMap.tenantId || '';
      const environment = dataMap.environment || dataMap.scopeLevel || '';

      const projectRefs = (e.serviceEndpointProjectReferences || []).map(ref => {
        return ref.name || ref.projectReference?.name || '';
      }).filter(Boolean);

      return {
        id: e.id || `sc-${idx}`,
        name: e.name || 'Unnamed Service Connection',
        type: e.type || 'generic',
        rawType: rawType,
        url: e.url || 'https://dev.azure.com',
        description: e.description || '',
        scheme: rawScheme,
        isReady: isReady,
        isShared: !!e.isShared,
        owner: e.owner || 'Library',
        createdBy: e.createdBy?.displayName || e.createdBy?.uniqueName || 'DevOps Administrator',
        createdEmail: e.createdBy?.uniqueName || '',
        subscriptionName: subscriptionName,
        tenantId: tenantId,
        environment: environment,
        projectReferences: projectRefs.length ? projectRefs : [cleanProject],
        data: dataMap,
        rawEndpoint: e,
        urlAdo: `https://dev.azure.com/${org}/${encodeURIComponent(cleanProject)}/_settings/adminservices?resourceId=${e.id}`
      };
    });

    // 3. Apply Filters
    let filtered = processed;

    if (typeFilter !== 'all') {
      if (typeFilter === 'azurerm') {
        filtered = filtered.filter(e => e.rawType.includes('azurerm') || e.rawType.includes('azure'));
      } else if (typeFilter === 'github') {
        filtered = filtered.filter(e => e.rawType.includes('github') || e.rawType.includes('git'));
      } else if (typeFilter === 'docker') {
        filtered = filtered.filter(e => e.rawType.includes('docker') || e.rawType.includes('container') || e.rawType.includes('acr'));
      } else if (typeFilter === 'kubernetes') {
        filtered = filtered.filter(e => e.rawType.includes('kubernetes') || e.rawType.includes('k8s'));
      } else if (typeFilter === 'other') {
        filtered = filtered.filter(e => !e.rawType.includes('azurerm') && !e.rawType.includes('github') && !e.rawType.includes('docker') && !e.rawType.includes('kubernetes'));
      }
    }

    if (searchFilter) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(searchFilter) ||
        e.type.toLowerCase().includes(searchFilter) ||
        e.scheme.toLowerCase().includes(searchFilter) ||
        e.createdBy.toLowerCase().includes(searchFilter) ||
        e.subscriptionName.toLowerCase().includes(searchFilter)
      );
    }

    this.endpoints = filtered;
    this.index = 0;

    // 4. Compute KPIs
    const totalCount = this.endpoints.length;
    const readyCount = this.endpoints.filter(e => e.isReady).length;
    const azureCount = this.endpoints.filter(e => e.rawType.includes('azurerm') || e.rawType.includes('azure')).length;
    const thirdPartyCount = totalCount - azureCount;

    window.HubApp.setKpis(
      cleanProject,
      'Service Connections',
      totalCount,
      'Verified / Ready',
      readyCount,
      'Azure / 3rd-Party',
      `${azureCount} / ${thirdPartyCount}`
    );

    this.render(false);

    // 5. Aggregate Chart distribution
    let typeDistribution = {};
    this.endpoints.forEach(e => {
      let category = 'Other';
      if (e.rawType.includes('azurerm') || e.rawType.includes('azure')) category = 'Azure Resource Manager';
      else if (e.rawType.includes('github')) category = 'GitHub';
      else if (e.rawType.includes('docker') || e.rawType.includes('container')) category = 'Docker / Container Registry';
      else if (e.rawType.includes('kubernetes') || e.rawType.includes('k8s')) category = 'Kubernetes';
      else if (e.rawType.includes('sonarqube') || e.rawType.includes('sonar')) category = 'SonarQube / Quality';
      else if (e.rawType.includes('jira') || e.rawType.includes('bitbucket')) category = 'Atlassian / Git';
      else if (e.rawType.includes('aws')) category = 'Amazon Web Services';
      else if (e.rawType.includes('generic')) category = 'Generic / Webhook';
      else category = e.type;

      typeDistribution[category] = (typeDistribution[category] || 0) + 1;
    });

    const chartKeys = Object.keys(typeDistribution).length ? Object.keys(typeDistribution) : ['No Connections'];
    const chartVals = Object.values(typeDistribution).length ? Object.values(typeDistribution) : [0];

    window.HubApp.renderChart(chartKeys, chartVals, 'Service Connections by Platform / Type');
  },

  getTypeBadge(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('azurerm') || t.includes('azure')) {
      return `<span class="badge badge-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>Azure RM</span>`;
    }
    if (t.includes('github')) {
      return `<span class="badge badge-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>GitHub</span>`;
    }
    if (t.includes('docker') || t.includes('container') || t.includes('acr')) {
      return `<span class="badge badge-active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>Docker Registry</span>`;
    }
    if (t.includes('kubernetes') || t.includes('k8s')) {
      return `<span class="badge badge-inprogress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polygon points="12 6 16 14 8 14 12 6"></polygon></svg>Kubernetes</span>`;
    }
    if (t.includes('sonar')) {
      return `<span class="badge badge-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>SonarQube</span>`;
    }
    return `<span class="badge badge-canceled">${type}</span>`;
  },

  getSchemeBadge(scheme) {
    const s = (scheme || '').toLowerCase();
    if (s.includes('workloadidentity') || s.includes('federation') || s.includes('oidc')) {
      return `<span class="badge badge-succeeded"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Workload Identity (OIDC)</span>`;
    }
    if (s.includes('serviceprincipal') || s.includes('spn')) {
      return `<span class="badge badge-blue">Service Principal (Secret/Cert)</span>`;
    }
    if (s.includes('oauth') || s.includes('installationtoken')) {
      return `<span class="badge badge-purple">OAuth 2.0 / App Token</span>`;
    }
    if (s.includes('token') || s.includes('personalaccesstoken')) {
      return `<span class="badge badge-warning">Personal Access Token (PAT)</span>`;
    }
    if (s.includes('usernamepassword') || s.includes('basic')) {
      return `<span class="badge badge-stale">Username / Password</span>`;
    }
    return `<span class="badge badge-canceled">${scheme}</span>`;
  },

  getStatusBadge(isReady) {
    if (isReady) {
      return `
        <span class="badge badge-succeeded">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Operational / Ready
        </span>
      `;
    }
    return `
      <span class="badge badge-failed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        Action Required / Inactive
      </span>
    `;
  },

  render(append = false) {
    const tbody = document.getElementById('serviceConnectionsTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    if (this.endpoints.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No service connections found for this project.</td></tr>`;
      document.getElementById('seeMoreServiceConnectionsContainer')?.classList.add('hidden');
      return;
    }

    const slice = this.endpoints.slice(this.index, this.index + this.pageSize);

    slice.forEach((conn, localIdx) => {
      const globalIdx = this.index + localIdx;
      const typeBadge = this.getTypeBadge(conn.type);
      const schemeBadge = this.getSchemeBadge(conn.scheme);
      const statusBadge = this.getStatusBadge(conn.isReady);

      const targetScope = conn.subscriptionName ? conn.subscriptionName : (conn.url.replace(/^https?:\/\//, '').split('/')[0] || conn.url);

      const tr = document.createElement('tr');
      tr.title = 'Click to open Azure Blade Telemetry for this Service Connection';
      tr.innerHTML = `
        <td><strong>${conn.name}</strong></td>
        <td>${typeBadge}</td>
        <td>${schemeBadge}</td>
        <td><code>${targetScope}</code></td>
        <td>${conn.createdBy}</td>
        <td>${statusBadge}</td>
      `;
      tr.addEventListener('click', () => this.openConnBlade(globalIdx));
      tbody.appendChild(tr);
    });

    this.index += slice.length;

    const rem = this.endpoints.length - this.index;
    const moreBtn = document.getElementById('seeMoreServiceConnectionsContainer');
    if (moreBtn) {
      moreBtn.classList.toggle('hidden', rem <= 0);
      const counter = document.getElementById('serviceConnectionsRemainingCount');
      if (counter) counter.textContent = rem;
    }
  },

  openConnBlade(connIdx) {
    const conn = this.endpoints[connIdx];
    if (!conn) return;

    window.BladeController.openBlade({
      title: `Service Connection: ${conn.name}`,
      subtitle: `Project Service Endpoint & Cloud Integration Telemetry`,
      breadcrumbProject: this.currentProject,
      breadcrumbResource: `Service Connections > ${conn.name}`,
      adoUrl: conn.urlAdo,
      rawData: conn.rawEndpoint,
      iconSvg: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      `,
      renderers: {
        overview: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              Service Connection Profile
            </div>
            <div class="blade-kv-grid">
              <div class="blade-kv-item">
                <span class="blade-kv-label">CONNECTION NAME</span>
                <span class="blade-kv-value"><strong>${conn.name}</strong></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">SERVICE TYPE</span>
                <span class="blade-kv-value">${this.getTypeBadge(conn.type)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">AUTHENTICATION SCHEME</span>
                <span class="blade-kv-value">${this.getSchemeBadge(conn.scheme)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">OPERATIONAL STATE</span>
                <span class="blade-kv-value">${this.getStatusBadge(conn.isReady)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">TARGET SERVER / CLOUD URL</span>
                <span class="blade-kv-value"><code>${conn.url}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">CREATED BY</span>
                <span class="blade-kv-value">${conn.createdBy} ${conn.createdEmail ? '(' + conn.createdEmail + ')' : ''}</span>
              </div>
              <div class="blade-kv-item" style="grid-column: 1 / -1;">
                <span class="blade-kv-label">PROJECT SCOPES / REFERENCES</span>
                <span class="blade-kv-value">${conn.projectReferences.map(p => `<span class="badge badge-blue" style="margin-right:4px;">${p}</span>`).join('')}</span>
              </div>
              ${conn.description ? `
                <div class="blade-kv-item" style="grid-column: 1 / -1;">
                  <span class="blade-kv-label">DESCRIPTION</span>
                  <span class="blade-kv-value" style="font-size:12.5px; color:var(--text-secondary);">${conn.description}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Security & Pipeline Authorization
            </div>
            <p style="font-size:12.5px; color:var(--text-secondary); line-height: 1.5;">
              ${conn.isShared ? 'Shared across multiple projects in this organization.' : `Scoped exclusively to project <strong>${this.currentProject}</strong>.`}
              Pipelines require explicit role permissions or pre-authorized pipeline approvals to access this service endpoint.
            </p>
          </div>
        `,

        stages: () => {
          const isOidc = conn.scheme.toLowerCase().includes('workloadidentity') || conn.scheme.toLowerCase().includes('federation');
          const isSpn = conn.scheme.toLowerCase().includes('serviceprincipal');

          return `
            <div class="blade-section">
              <div class="blade-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                Identity & Authorization Model
              </div>
              <div class="blade-kv-grid" style="margin-bottom:14px;">
                <div class="blade-kv-item">
                  <span class="blade-kv-label">AUTH METHOD</span>
                  <span class="blade-kv-value">${this.getSchemeBadge(conn.scheme)}</span>
                </div>
                <div class="blade-kv-item">
                  <span class="blade-kv-label">AUTH READY STATUS</span>
                  <span class="blade-kv-value">${conn.isReady ? '<span class="badge badge-succeeded">Token Verified</span>' : '<span class="badge badge-failed">Configuration Incomplete</span>'}</span>
                </div>
                ${conn.tenantId ? `
                  <div class="blade-kv-item">
                    <span class="blade-kv-label">TENANT ID</span>
                    <span class="blade-kv-value"><code>${conn.tenantId}</code></span>
                  </div>
                ` : ''}
                ${conn.subscriptionName ? `
                  <div class="blade-kv-item">
                    <span class="blade-kv-label">SUBSCRIPTION SCOPE</span>
                    <span class="blade-kv-value"><code>${conn.subscriptionName}</code></span>
                  </div>
                ` : ''}
              </div>

              <div class="p-3" style="background:var(--azure-surface-alt); border-radius:var(--radius-md); border:1px solid var(--azure-border);">
                <p style="font-size:13px; color:var(--text-main); font-weight:600; margin-bottom:4px;">
                  ${isOidc ? '🔒 Workload Identity Federation (Keyless & Secretless)' : (isSpn ? '🔑 Microsoft Entra App Registration (Service Principal)' : '🛡️ Standard Secure Service Connection')}
                </p>
                <p style="font-size:12px; color:var(--text-muted); line-height:1.4;">
                  ${isOidc
                    ? 'Uses OpenID Connect (OIDC) token exchange between Azure DevOps and Microsoft Entra ID. No static secrets or certificates to rotate.'
                    : 'Credentials and tokens are stored securely in Azure DevOps encrypted storage and injected at runtime into authorized CI/CD pipeline jobs.'}
                </p>
              </div>
            </div>
          `;
        },

        logs: () => {
          const dataEntries = Object.entries(conn.data || {});
          if (!dataEntries.length) {
            return `
              <div class="blade-section">
                <div class="blade-section-title">Configuration Properties</div>
                <p class="text-muted" style="font-size:13px;">No auxiliary metadata properties associated with this endpoint.</p>
              </div>
            `;
          }

          const propRows = dataEntries.map(([k, v]) => `
            <tr>
              <td style="font-weight:600; font-size:12px; width:40%;"><code>${k}</code></td>
              <td style="font-size:12px;"><code>${String(v)}</code></td>
            </tr>
          `).join('');

          return `
            <div class="blade-section">
              <div class="blade-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                Endpoint Configuration Properties (${dataEntries.length})
              </div>
              <div class="table-responsive" style="margin-top:8px;">
                <table>
                  <thead>
                    <tr>
                      <th>PROPERTY KEY</th>
                      <th>VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${propRows}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }
      }
    });
  }
};
