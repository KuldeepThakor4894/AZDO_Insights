// Azure DevOps Intelligence Hub - Project Security Groups & Access Module
window.AccessModule = {
  items: [],
  index: 0,
  pageSize: 25,
  currentProject: '',
  currentOrg: '',

  async fetch(org, project, pat, filterQuery) {
    this.currentOrg = org;
    this.currentProject = project;
    const auth = 'Basic ' + btoa(':' + pat);
    const userQuery = (filterQuery || '').trim().toLowerCase();
    const API_VERSION = '7.1-preview.1';

    let accessRows = [];
    let groupMemberCounts = {};
    const roleMap = {
      'Project Administrators': 'Admin',
      'Build Administrators': 'Admin',
      'Release Administrators': 'Admin',
      'Contributors': 'Contributor',
      'Readers': 'Reader',
      'CBB Readers': 'Reader',
      'Project Valid Users': 'Reader'
    };

    window.HubApp.setStatus(userQuery ? `Searching security groups for "${userQuery}"...` : `Discovering all project security groups in ${project}...`, 'info');

    // Helper: Direct Fetch
    const fetchAzDo = async (url) => {
      const res = await fetch(url, {
        headers: {
          'Authorization': auth,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    };

    // Step 1: Get Project Metadata & Storage Key Scope Descriptor
    const projMetaUrl = `https://dev.azure.com/${org}/_apis/projects/${encodeURIComponent(project)}?api-version=${API_VERSION}`;
    const projMeta = await fetchAzDo(projMetaUrl);
    const projectId = projMeta.id;

    let scopeDescriptor = '';
    try {
      const descUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/descriptors/${projectId}?api-version=${API_VERSION}`;
      const descData = await fetchAzDo(descUrl);
      scopeDescriptor = descData.value || '';
    } catch (e) {
      console.warn('Could not query scope descriptor directly, trying fallback scope...', e);
    }

    // Step 2: Fetch ALL Graph Groups in Project Scope
    let graphGroups = [];
    let continuationToken = '';

    do {
      const tokenParam = continuationToken ? `&continuationToken=${continuationToken}` : '';
      const scopeParam = scopeDescriptor ? `&scopeDescriptor=${scopeDescriptor}` : '';
      const groupsUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/groups?api-version=${API_VERSION}${scopeParam}${tokenParam}`;

      try {
        const gData = await fetchAzDo(groupsUrl);
        if (gData && gData.value) {
          const validGroups = gData.value.filter(g =>
            !scopeDescriptor || g.scopeDescriptor === scopeDescriptor || (g.principalName && g.principalName.includes(`[${project}]`))
          );
          graphGroups.push(...(validGroups.length ? validGroups : gData.value));
        }
        continuationToken = gData.continuationToken || '';
      } catch (ge) {
        console.warn('Graph API call error, falling back to org-level filtering:', ge);
        break;
      }
    } while (continuationToken);

    // Step 3: Include all Project Teams
    try {
      const teamsUrl = `https://dev.azure.com/${org}/_apis/projects/${encodeURIComponent(project)}/teams?api-version=${API_VERSION}`;
      const tData = await fetchAzDo(teamsUrl);
      (tData.value || []).forEach(team => {
        if (!graphGroups.some(g => g.displayName === team.name)) {
          graphGroups.push({
            displayName: team.name,
            descriptor: team.id,
            principalName: `[${project}]\\${team.name}`,
            isTeam: true
          });
        }
      });
    } catch (te) {
      console.warn('Teams discovery warning:', te);
    }

    window.HubApp.setStatus(`Found ${graphGroups.length} security groups/teams. Fetching member identities...`, 'info');

    // Step 4: Resolve Members for every group found
    for (const group of graphGroups) {
      const groupName = group.displayName || group.name;
      const groupDescriptor = group.descriptor;
      const groupPrincipal = group.principalName || `[${project}]\\${groupName}`;
      let groupRole = roleMap[groupName] || (groupName.toLowerCase().includes('admin') ? 'Admin' : (groupName.toLowerCase().includes('reader') ? 'Reader' : 'Contributor'));

      try {
        let members = [];
        if (group.isTeam) {
          const teamMembersUrl = `https://dev.azure.com/${org}/_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(group.displayName)}/members?api-version=${API_VERSION}`;
          const tmData = await fetchAzDo(teamMembersUrl);
          members = (tmData.value || []).map(m => ({
            displayName: m.identity?.displayName || m.displayName,
            uniqueName: m.identity?.uniqueName || m.uniqueName,
            mailAddress: m.identity?.mailAddress || m.mailAddress
          }));
        } else {
          const memsUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/memberships/${groupDescriptor}?direction=down&api-version=${API_VERSION}`;
          const mData = await fetchAzDo(memsUrl);
          const memberDescriptors = (mData.value || []).map(m => m.memberDescriptor);

          const memberPromises = memberDescriptors.map(async (mDesc) => {
            try {
              const uUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/users/${mDesc}?api-version=${API_VERSION}`;
              const uData = await fetchAzDo(uUrl);
              return {
                displayName: uData.displayName,
                uniqueName: uData.principalName || uData.mailAddress,
                mailAddress: uData.mailAddress
              };
            } catch (ue) {
              try {
                const subGroupUrl = `https://vssps.dev.azure.com/${org}/_apis/graph/groups/${mDesc}?api-version=${API_VERSION}`;
                const subGData = await fetchAzDo(subGroupUrl);
                return {
                  displayName: `[Nested Group] ${subGData.displayName}`,
                  uniqueName: subGData.principalName,
                  mailAddress: ''
                };
              } catch (sge) {
                return null;
              }
            }
          });

          const resolved = await Promise.all(memberPromises);
          members = resolved.filter(Boolean);
        }

        groupMemberCounts[groupName] = members.length;

        if (members.length === 0 && !userQuery) {
          accessRows.push({
            ProjectName: project,
            GroupName: groupName,
            GroupRole: groupRole,
            GroupDescriptor: groupDescriptor,
            GroupPrincipal: groupPrincipal,
            UserDisplayName: '(No Direct Members)',
            UserPrincipal: '-',
            MailAddress: '-',
            rawGroup: group
          });
        } else {
          members.forEach(mem => {
            const dName = mem.displayName || '';
            const uPrincipal = mem.uniqueName || '';
            const mail = mem.mailAddress || '';

            if (userQuery) {
              const q = userQuery;
              const matches = dName.toLowerCase().includes(q) || uPrincipal.toLowerCase().includes(q) || mail.toLowerCase().includes(q) || groupName.toLowerCase().includes(q);
              if (!matches) return;
            }

            accessRows.push({
              ProjectName: project,
              GroupName: groupName,
              GroupRole: groupRole,
              GroupDescriptor: groupDescriptor,
              GroupPrincipal: groupPrincipal,
              UserDisplayName: dName,
              UserPrincipal: uPrincipal,
              MailAddress: mail,
              rawGroup: group
            });
          });
        }
      } catch (err) {
        console.warn(`Could not resolve members for group ${groupName}:`, err);
      }
    }

    this.items = accessRows;
    this.index = 0;

    // Update KPI cards
    window.HubApp.setKpis(
      userQuery ? `Filtered: "${userQuery}"` : `${project} (All Groups)`,
      'Security Groups',
      Object.keys(groupMemberCounts).length,
      'Active Permissions',
      this.items.length,
      'Security Mode',
      'Graph Security'
    );

    this.render(false);

    // Render chart
    const topGroups = Object.entries(groupMemberCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const chartLabels = topGroups.length ? topGroups.map(g => g[0]) : ['No Groups'];
    const chartValues = topGroups.length ? topGroups.map(g => g[1]) : [0];

    window.HubApp.renderChart(chartLabels, chartValues, 'Members per Security Group');
  },

  getRoleBadge(role) {
    if (role === 'Admin') {
      return `<span class="badge badge-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>Admin</span>`;
    } else if (role === 'Contributor') {
      return `<span class="badge badge-inprogress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Contributor</span>`;
    }
    return `<span class="badge badge-active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle></svg>Reader</span>`;
  },

  render(append = false) {
    const tbody = document.getElementById('accessTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    if (this.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No security groups or permissions found matching your criteria.</td></tr>`;
      document.getElementById('seeMoreAccessContainer')?.classList.add('hidden');
      return;
    }

    const slice = this.items.slice(this.index, this.index + this.pageSize);

    slice.forEach((item, localIdx) => {
      const globalIdx = this.index + localIdx;
      const tr = document.createElement('tr');
      tr.title = 'Click to inspect Group Permission Blade';
      tr.innerHTML = `
        <td><strong>${item.ProjectName}</strong></td>
        <td><code>${item.GroupName}</code></td>
        <td>${this.getRoleBadge(item.GroupRole)}</td>
        <td><strong>${item.UserDisplayName}</strong></td>
        <td>${item.MailAddress || item.UserPrincipal || '-'}</td>
      `;
      tr.addEventListener('click', () => this.openAccessBlade(globalIdx));
      tbody.appendChild(tr);
    });

    this.index += slice.length;

    const rem = this.items.length - this.index;
    const moreBtn = document.getElementById('seeMoreAccessContainer');
    if (moreBtn) {
      moreBtn.classList.toggle('hidden', rem <= 0);
      const counter = document.getElementById('accessRemainingCount');
      if (counter) counter.textContent = rem;
    }
  },

  openAccessBlade(itemIdx) {
    const item = this.items[itemIdx];
    if (!item) return;

    window.BladeController.openBlade({
      title: `${item.GroupName}`,
      subtitle: `Security Group Membership & Role Scope Analysis`,
      breadcrumbProject: this.currentProject,
      breadcrumbResource: `Security > ${item.GroupName}`,
      adoUrl: `https://dev.azure.com/${this.currentOrg}/${encodeURIComponent(this.currentProject)}/_settings/permissions`,
      rawData: item.rawGroup || item,
      iconSvg: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      `,
      renderers: {
        overview: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              Security Group & Member Details
            </div>
            <div class="blade-kv-grid">
              <div class="blade-kv-item">
                <span class="blade-kv-label">PROJECT SCOPE</span>
                <span class="blade-kv-value">${item.ProjectName}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">SECURITY GROUP</span>
                <span class="blade-kv-value"><code>${item.GroupName}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">ASSIGNED ROLE</span>
                <span class="blade-kv-value">${this.getRoleBadge(item.GroupRole)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">MEMBER IDENTITY</span>
                <span class="blade-kv-value">${item.UserDisplayName}</span>
              </div>
              <div class="blade-kv-item" style="grid-column: 1 / -1;">
                <span class="blade-kv-label">PRINCIPAL NAME / EMAIL</span>
                <span class="blade-kv-value"><code>${item.MailAddress || item.UserPrincipal || 'N/A'}</code></span>
              </div>
              <div class="blade-kv-item" style="grid-column: 1 / -1;">
                <span class="blade-kv-label">GROUP PRINCIPAL DESCRIPTOR</span>
                <span class="blade-kv-value"><code>${item.GroupPrincipal || item.GroupDescriptor || 'Project Scope'}</code></span>
              </div>
            </div>
          </div>
        `
      }
    });
  }
};
