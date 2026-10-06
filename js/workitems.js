// Azure DevOps Intelligence Hub - Work Items & Backlog Module
window.WorkItemModule = {
  items: [],
  index: 0,
  pageSize: 25,
  currentProject: '',
  currentOrg: '',

  async fetch(org, project, pat, userQuery) {
    this.currentOrg = org;
    this.currentProject = project;
    const auth = 'Basic ' + btoa(':' + pat);
    const cleanProject = project.trim();
    const cleanUserQuery = (userQuery || '').trim();

    // 1. Construct WIQL Query with Fallback
    let wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo], [System.CreatedDate], [System.IterationPath] FROM WorkItems WHERE [System.TeamProject] = @project`;
    if (cleanUserQuery) {
      wiql += ` AND [System.AssignedTo] CONTAINS '${cleanUserQuery.replace(/'/g, "''")}'`;
    }
    wiql += ` ORDER BY [System.ChangedDate] DESC`;

    // 2. Execute WIQL Query POST
    let ids = [];
    try {
      const wiqlUrl = `https://dev.azure.com/${org}/${encodeURIComponent(cleanProject)}/_apis/wit/wiql?$top=100&api-version=6.0`;
      let qRes = await fetch(wiqlUrl, {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: wiql })
      });

      if (!qRes.ok) {
        let fallbackWiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${cleanProject.replace(/'/g, "''")}'`;
        if (cleanUserQuery) {
          fallbackWiql += ` AND [System.AssignedTo] CONTAINS '${cleanUserQuery.replace(/'/g, "''")}'`;
        }
        fallbackWiql += ` ORDER BY [System.ChangedDate] DESC`;
        
        qRes = await fetch(wiqlUrl, {
          method: 'POST',
          headers: { 'Authorization': auth, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: fallbackWiql })
        });
      }

      if (qRes.ok) {
        const qData = await qRes.json();
        ids = (qData.workItems || []).map(w => w.id).slice(0, 100);
      }
    } catch (wiqlErr) {
      console.warn('WIQL query error:', wiqlErr);
    }

    // 3. Handle Empty Query Results
    if (!ids || ids.length === 0) {
      this.items = [];
      this.index = 0;
      this.render(false);
      window.HubApp.setKpis(cleanUserQuery || cleanProject, 'Work Items', 0, 'Types', 0, 'Mode', 'WIQL Query');
      window.HubApp.renderChart(['No Items'], [0], 'Work Items by Type');
      return;
    }

    // 4. Batch Fetch Work Item Details in chunks of 50
    let allWorkItems = [];
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunkIds = ids.slice(i, i + chunkSize);
      try {
        const detailsData = await window.HubApp.fetchAdo(
          org,
          `${encodeURIComponent(cleanProject)}/_apis/wit/workitems?ids=${chunkIds.join(',')}&$expand=all&api-version=6.0`,
          auth
        );
        allWorkItems = allWorkItems.concat(detailsData.value || []);
      } catch (detErr) {
        console.warn('Work items batch detail error:', detErr);
      }
    }

    // 5. Process Work Item Fields & Type Distribution
    let typeCounts = {};
    this.items = allWorkItems.map(w => {
      const f = w.fields || {};
      const type = f['System.WorkItemType'] || 'Item';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      let assignedName = 'Unassigned';
      let assignedEmail = '';
      if (f['System.AssignedTo']) {
        assignedName = f['System.AssignedTo'].displayName || f['System.AssignedTo'].name || f['System.AssignedTo'];
        assignedEmail = f['System.AssignedTo'].uniqueName || f['System.AssignedTo'].mailAddress || '';
      }

      return {
        id: w.id,
        type: type,
        title: f['System.Title'] || 'Untitled Work Item',
        assigned: assignedName,
        assignedEmail: assignedEmail,
        state: f['System.State'] || 'Unknown',
        iteration: f['System.IterationPath'] || cleanProject,
        date: f['System.CreatedDate'] ? new Date(f['System.CreatedDate']).toLocaleDateString() : 'N/A',
        url: w._links?.html?.href || `https://dev.azure.com/${org}/${encodeURIComponent(cleanProject)}/_workitems/edit/${w.id}`,
        rawWorkItem: w
      };
    });

    this.index = 0;

    // Update KPIs
    window.HubApp.setKpis(
      cleanUserQuery || cleanProject,
      'Total Work Items',
      this.items.length,
      'Item Types',
      Object.keys(typeCounts).length,
      'Query Engine',
      'WIQL Scope'
    );

    this.render(false);

    // Render chart
    window.HubApp.renderChart(Object.keys(typeCounts), Object.values(typeCounts), 'Work Items by Category / Type');
  },

  getTypeBadge(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('bug')) {
      return `<span class="badge badge-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>Bug</span>`;
    } else if (t.includes('epic')) {
      return `<span class="badge badge-stale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>Epic</span>`;
    } else if (t.includes('feature')) {
      return `<span class="badge badge-inprogress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Feature</span>`;
    } else if (t.includes('task')) {
      return `<span class="badge badge-active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>Task</span>`;
    }
    return `<span class="badge badge-blue">${type}</span>`;
  },

  getStateBadge(state) {
    const s = (state || '').toLowerCase();
    if (s.includes('active') || s.includes('progress') || s.includes('doing')) {
      return `<span class="badge badge-inprogress">${state}</span>`;
    } else if (s.includes('closed') || s.includes('done') || s.includes('resolved')) {
      return `<span class="badge badge-succeeded"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>${state}</span>`;
    } else if (s.includes('new') || s.includes('to do')) {
      return `<span class="badge badge-blue">${state}</span>`;
    }
    return `<span class="badge badge-canceled">${state}</span>`;
  },

  render(append = false) {
    const tbody = document.getElementById('workItemsTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    if (this.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No work items found matching the current query.</td></tr>`;
      document.getElementById('seeMoreWorkItemsContainer')?.classList.add('hidden');
      return;
    }

    const slice = this.items.slice(this.index, this.index + this.pageSize);

    slice.forEach((w, localIdx) => {
      const globalIdx = this.index + localIdx;
      const tr = document.createElement('tr');
      tr.title = 'Click to inspect Work Item Blade in Azure Boards format';
      tr.innerHTML = `
        <td><code>#${w.id}</code></td>
        <td>${this.getTypeBadge(w.type)}</td>
        <td><strong>${w.title}</strong></td>
        <td>${w.assigned}</td>
        <td>${this.getStateBadge(w.state)}</td>
        <td>${w.date}</td>
      `;
      tr.addEventListener('click', () => this.openWorkItemBlade(globalIdx));
      tbody.appendChild(tr);
    });

    this.index += slice.length;

    const rem = this.items.length - this.index;
    const moreBtn = document.getElementById('seeMoreWorkItemsContainer');
    if (moreBtn) {
      moreBtn.classList.toggle('hidden', rem <= 0);
      const counter = document.getElementById('workItemsRemainingCount');
      if (counter) counter.textContent = rem;
    }
  },

  openWorkItemBlade(itemIdx) {
    const w = this.items[itemIdx];
    if (!w) return;

    window.BladeController.openBlade({
      title: `#${w.id}: ${w.title}`,
      subtitle: `Azure Boards Backlog & Work Item Telemetry`,
      breadcrumbProject: this.currentProject,
      breadcrumbResource: `Boards > #${w.id}`,
      adoUrl: w.url,
      rawData: w.rawWorkItem,
      iconSvg: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      `,
      renderers: {
        overview: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              Work Item Backlog Details
            </div>
            <div class="blade-kv-grid">
              <div class="blade-kv-item">
                <span class="blade-kv-label">WORK ITEM ID</span>
                <span class="blade-kv-value"><code>#${w.id}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">WORK ITEM TYPE</span>
                <span class="blade-kv-value">${this.getTypeBadge(w.type)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">STATE / STATUS</span>
                <span class="blade-kv-value">${this.getStateBadge(w.state)}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">ASSIGNED TO</span>
                <span class="blade-kv-value">${w.assigned} ${w.assignedEmail ? '(' + w.assignedEmail + ')' : ''}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">ITERATION PATH</span>
                <span class="blade-kv-value"><code>${w.iteration}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">CREATION DATE</span>
                <span class="blade-kv-value">${w.date}</span>
              </div>
              <div class="blade-kv-item" style="grid-column: 1 / -1;">
                <span class="blade-kv-label">TITLE / SUMMARY</span>
                <span class="blade-kv-value" style="font-size:13.5px; font-weight:600; color:var(--text-main); margin-top:2px;">${w.title}</span>
              </div>
            </div>
          </div>
        `
      }
    });
  }
};
