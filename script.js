
const searchBar = document.getElementById('search-bar');
const loader = document.getElementById('loading-spinner');
const results = document.getElementById('results');

// Initialize packageList from localStorage if available
const defaultRepos = { "rewpkgs": "//raw.githubusercontent.com/kevinJ045/rewpkgs/main/main.yaml" };
let packageList = localStorage.getItem('packageList') ? JSON.parse(localStorage.getItem('packageList')) : defaultRepos;
const packageListElement = document.getElementById('packages');

const renderPackages = () => {
  packageListElement.innerHTML = "";
  for (let pkg in packageList) {
    renderPackage(pkg, packageList[pkg]);
  }
};

const addPackage = () => {
  const li = document.createElement('li');
  li.className = 'input';
  const keyEl = document.createElement('input');
  keyEl.type = 'text';
  keyEl.placeholder = 'Repo name';
  
  const urlEl = document.createElement('input');
  urlEl.type = 'text';
  urlEl.placeholder = 'Repo URL';
  
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save';
  
  saveButton.addEventListener('click', () => {
    const newPkg = keyEl.value.trim();
    const newUrl = urlEl.value.trim();
    if (newPkg && newUrl) {
      packageList[newPkg] = newUrl;
      localStorage.setItem('packageList', JSON.stringify(packageList));
      renderPackages();
    }
  });
  
  li.appendChild(keyEl);
  li.appendChild(document.createTextNode(': '));
  li.appendChild(urlEl);
  li.appendChild(saveButton);
  
  packageListElement.appendChild(li);
}

function showLoading(){
  searchBar.disabled = true;
  loader.style.display = 'block';
}


function hideLoading(){
  searchBar.disabled = false;
  loader.style.display = 'none';
}

// Function to render a single package
const renderPackage = (pkg, url) => {
  const li = document.createElement('li');
  const keyEl = document.createElement('code');
  const urlEl = document.createElement('a');
  urlEl.innerText = urlEl.href = url;
  keyEl.innerText = pkg;
  li.appendChild(keyEl);
  li.appendChild(document.createTextNode(': '));
  li.appendChild(urlEl);
  if(!(pkg in defaultRepos)) {
    const remove = document.createElement('div');
    remove.className = 'remove';
    li.appendChild(remove);
    remove.addEventListener('click', () => {
      delete packageList[pkg];
      localStorage.setItem('packageList', JSON.stringify(packageList));
      renderPackages();
    });
  }
  packageListElement.appendChild(li);
};

async function getRepoJson(repoUrl) {
  try {
    const res = await fetch(repoUrl.startsWith('//.') ? 'http://' + repoUrl.slice(3) :
      repoUrl.startsWith('//') ? 'https://' + repoUrl : repoUrl);
    const text = await res.text();
    const json = text.startsWith('---') || text.startsWith('%YAML') ? jsyaml.loadAll(text)[0] : JSON.parse(text);

    if (Array.isArray(json.include)) {
      for (let i of json.include) {
        json.packages = {
          ...json.packages,
          ...((await getRepoJson(i.startsWith('.') ? new URL(i, repoUrl).href : i)).packages || {})
        };
      }
    }
    return json;
  } catch (e) {
    console.error('Fetch Error. Check your connection.', e);
    return {};
  }
}

function setupIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('packagesDB', 1);
    request.onerror = (event) => reject('Database error:', event.target.errorCode);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('packages', { keyPath: 'name' });
    };
  });
}

async function storePackages(packages) {
  const db = await setupIndexedDB();
  const transaction = db.transaction(['packages'], 'readwrite');
  const store = transaction.objectStore('packages');
  for (let pkg of packages) {
    store.put(pkg);
  }
}

async function findPackage(name) {
  const db = await setupIndexedDB();
  const transaction = db.transaction(['packages'], 'readonly');
  const store = transaction.objectStore('packages');
  return new Promise((resolve) => {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const pkg = cursor.value;
        if(pkg.name == name){
          resolve(pkg);
        } else cursor.continue();
      } else {
        resolve(null);
      }
    };
  });
}

async function searchPackages(term) {
  const db = await setupIndexedDB();
  const transaction = db.transaction(['packages'], 'readonly');
  const store = transaction.objectStore('packages');
  const packages = [];
  return new Promise((resolve) => {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const pkg = cursor.value;
        if (term == '*' || pkg.name.toLowerCase().includes(term.toLowerCase()) || (pkg['package.json'] && JSON.parse(pkg['package.json']).keywords?.some((keyword) => keyword.toLowerCase().includes(term.toLowerCase())))) {
          packages.push(pkg);
        }
        cursor.continue();
      } else {
        resolve(packages);
      }
    };
  });
}

function parseMarkdown(markdown){
  return new showdown.Converter().makeHtml(markdown);
}

function createResultItem(pkg, active) {
  const { name, 'package.json': packageJson, 'README.md': readme } = pkg;
  const description = packageJson ? JSON.parse(packageJson).description || "None" : "None";
  const keywords = packageJson ? (JSON.parse(packageJson).keywords || []).map(tag => `<span class="tag">${tag}</span>`).join(' ') || "None" : "None";
  const githubUrl = packageJson && JSON.parse(packageJson).repository ? JSON.parse(packageJson).repository.url.split('+')[1] : `https://github.com/${pkg.url.split(':')[1]}`;

  return `
    <div pkg="${name}" class="result-item${active ? ' active' :''}">
      <h3 class="title">${name}</h3>
      <div class="tags">${keywords}</div>
      <div class="close"></div>

      <div class="content">
        <br />
        <p>Github: <a href="${githubUrl}" target="_blank">${githubUrl}</a></p>
        <br />
        <h4>Description</h4>
        ${description}
        <br />
        <br />
          ${readme && readme !== '404: Not Found' ? `
            <details>
              <summary>README</summary>
              <div class="readme-content">${parseMarkdown(readme)}</div>
            </details>` : ""}
          <h4>Install:</h4>
          <div class="tabs">
            <button class="tab active" onclick="showTab(this, 'rew-${name}')">Rew</button>
            <button class="tab" onclick="showTab(this, 'pimmy-${name}')">Pimmy</button>
            <button class="tab" onclick="showTab(this, 'github-${name}')">Github</button>
          </div>
          <div class="code-block" id="rew-${name}"><b r>$ </b><b c>rew</b> <b o>install</b> <b g>@${pkg.repo.name}/${name}</b></div>
          <div class="code-block" id="pimmy-${name}" style="display:none"><b r>$ </b><b c>pimmy</b> <b o>-Sa</b> <b g>${pkg.repo.name}/${name}</b></div>
          <div class="code-block" id="github-${name}" style="display:none"><b r>$ </b><b c>rew</b> <b o>install</b> <b g>${pkg.url}</b></div>
        </div>
      </div>
    </div>
  `;
}

async function fetchAndStorePackages(name, url) {
  const json = await getRepoJson(url);
  const packages = [];
  if (json.packages) {
    for (let pkgName in json.packages) {
      const pkg = { name: pkgName, repo: { name, url }, url: json.packages[pkgName] };
      let match = json.packages[pkgName].match(/^github:([^\/]+)\/(.+)$/)
      const [, owner, repoName] = match;
      const filesToFetch = ['app.yaml', 'package.json', 'README.md'];
      for (let file of filesToFetch) {
        const fileUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${file}`;
        try{
          const content = await fetch(fileUrl).then(res => res.ok ? res.text() : null).catch(e => {});
          if (content) {
            pkg[file] = content;
          }
        } catch(e) { continue; }
      }
      const appYaml = jsyaml.load(pkg);
      if(appYaml?.assets?.icon) pkg.icon = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${appYaml.assets.icon}`
      packages.push(pkg);
    }
  }
  await storePackages(packages);
}

let lastOpen, lastModal, skipnext;

document.addEventListener('DOMContentLoaded', () => {
  const syncButton = document.getElementById('sync-btn');
  const addButton = document.getElementById('add-btn');
  const allButton = document.getElementById('all-btn');

  addButton.addEventListener('click', async (event) => {
    addPackage();
  });
  
  allButton.addEventListener('click', async (event) => {
    searchBar.value = '*';
    searchBar.dispatchEvent(new Event('input'));
  });

  syncButton.addEventListener('click', async (event) => {
    showLoading();
    for (let i in packageList){
      await fetchAndStorePackages(i, packageList[i]);
    }
    hideLoading();
  });

  searchBar.addEventListener('input', async () => {
    const term = searchBar.value.toLowerCase().trim();
    if(!term.length) return results.innerHTML = '';
    const matches = await searchPackages(term);
    if(!matches.length) results.innerHTML = '<div class="centered"><h2>Oops...</h2><p>Couldn\'t find packages with the term "'+searchBar.value+'"</p></div>'
    else results.innerHTML = matches.map(pkg => createResultItem(pkg)).join('');
  });

  results.addEventListener('click', async (event) => {
    let targetElement = event.target;
    const close = event.target.classList.contains('close');
  
    while (targetElement && !targetElement.classList.contains('result-item')) {
      targetElement = targetElement.parentNode;
    }
  
    if (targetElement && targetElement.classList.contains('result-item')) {
      if(!close){
        const rect = targetElement.getBoundingClientRect();
        const rectP = targetElement.parentNode.getBoundingClientRect();
        const xPercent = ((rect.left + rect.width / 2) / rectP.width) * 100;
        const yPercent = ((rect.top + rect.height / 2) / rectP.height) * 100;

        targetElement.style.setProperty('--translateX', `${xPercent}%`);
        targetElement.style.setProperty('--translateY', `${yPercent}%`);
      }
      if(lastOpen) lastOpen.classList['remove']('active');
      targetElement.classList[close ? 'remove' : 'add']('active');
      if(close) {
        targetElement.classList['add']('closed');
        lastOpen = null;
        lastModal?.remove();
        location.hash = '';
      } else {
        if(lastOpen == targetElement) return;
        skipnext = true; 
        location.hash = 'pkg:'+targetElement.getAttribute('pkg');
        lastModal = document.createElement('div');
        lastModal.className = 'modal';
        lastModal.style.display = 'block';
        lastModal.style.zIndex = '998';
        document.body.appendChild(lastModal);
        lastOpen = targetElement;
      }
    }
  });

  renderPackages();
});

function showTab(button, tabId) {
  const parent = button.closest('.result-item');
  parent.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  parent.querySelectorAll('.code-block').forEach(block => block.style.display = 'none');
  button.classList.add('active');
  document.getElementById(tabId).style.display = 'block';
}
const modals = {
  'ilikethis': document.getElementById('ilikethis-modal'),
  'whatisthis': document.getElementById('whatisthis-modal')
};

// Function to show the modal
function showModal(id) {
  if (modals[id]) {
    modals[id].style.display = 'block';
    document.body.style.overflow = 'hidden'; // Disable background scrolling
  }
}

function hideModal(id) {
  if (modals[id]) {
    modals[id].style.display = 'none';
    document.body.style.overflow = 'auto'; 
  }
}

function updateHash(){
  const hash = window.location.hash.substring(1); 
  for (const key in modals) {
    if (key === hash) {
      showModal(key);
    } else {
      hideModal(key);
    }
  }
  if(hash.startsWith('pkg:') && !skipnext){
    const packagename = hash.split('pkg:')[1];
    findPackage(packagename)
      .then(pkg => {
        if(!pkg) return;
        results.innerHTML = createResultItem(pkg);
        results.querySelector('.result-item').click();
      });
  }
  if(lastOpen && !skipnext) lastOpen.querySelector('.close').click();
  if(skipnext) skipnext = false;
  return hash;
}

window.addEventListener('hashchange', () => {
  updateHash();
});

window.addEventListener('DOMContentLoaded', () => {
  updateHash();
});