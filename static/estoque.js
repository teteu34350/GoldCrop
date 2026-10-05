document.addEventListener("DOMContentLoaded", () => {
    carregarDashboard();
    carregarEstoque();
    carregarMovimentacoes();
    carregarTalhoes();
    
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            filtrarProdutos();
        });
    });

    document.getElementById("buscaProduto").addEventListener("input", filtrarProdutos);
    
    const hoje = new Date().toISOString().split("T")[0];
    document.getElementById("entData").value = hoje;
    document.getElementById("saiData").value = hoje;
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + tabId).style.display = 'block';
    
    document.querySelectorAll('.tab-main-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });

    if (tabId === 'dashboard') carregarDashboard();
    if (tabId === 'produtos') carregarEstoque();
    if (tabId === 'movimentacoes') carregarMovimentacoes();
}

let produtosGlobal = [];
let talhoesGlobal = [];

async function carregarDashboard() {
    try {
        const res = await fetch("/api/estoque/dashboard/");
        const data = await res.json();
        if (data.ok) {
            renderizarDashboard(data);
        } else {
            showToast(data.message || "Erro ao carregar dashboard.", "error");
        }
    } catch (e) {
        console.error("Falha de conexão no dashboard.", e);
    }
}

function renderizarDashboard(data) {
    // 1. Resumo
    document.getElementById("dashTotalProdutos").innerText = data.resumo.total_produtos;
    document.getElementById("dashEstoqueBaixo").innerText = data.resumo.estoque_baixo;
    document.getElementById("dashSemEstoque").innerText = data.resumo.sem_estoque;
    document.getElementById("dashMovimentacoes").innerText = data.resumo.movimentacoes_30d;

    // 2. Alertas
    const listaAlertas = document.getElementById("listaAlertas");
    if (data.alertas.length === 0) {
        listaAlertas.innerHTML = `<div style="text-align:center; color:var(--gray-500); padding: 1rem 0;">Tudo certo!<br><small>Nenhum produto precisa de reposição no momento.</small></div>`;
    } else {
        listaAlertas.innerHTML = data.alertas.map(a => `
            <div class="estoque-alert-item" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--gray-100); padding-bottom:0.5rem;">
                <div class="estoque-alert-info">
                    <div style="font-weight:600; font-size:0.875rem; color:var(--gray-900);">${a.produto}</div>
                    <div style="font-size:0.75rem; color:var(--gray-500);">
                        ${a.quantidade} ${a.unidade} (Mín: ${a.estoque_minimo})
                    </div>
                </div>
                <div class="estoque-alert-actions">
                    ${a.situacao === 'danger' ? '<span style="color:var(--red-600); font-size:0.75rem; font-weight:700; margin-right:0.5rem;">SEM ESTOQUE</span>' : ''}
                    <button class="btn-ghost" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="abrirModalEntrada(${a.produto_id}, '${a.produto}', '${a.unidade}')">Repor</button>
                </div>
            </div>
        `).join("");
    }

    // 3. Categorias (Gráfico de Barras Horizontal)
    const maxCat = Math.max(...data.categorias.map(c => c.quantidade), 1);
    const chartCat = document.getElementById("chartCategorias");
    if (data.categorias.length === 0) {
        chartCat.innerHTML = `<div style="color:var(--gray-500); font-size:0.875rem;">Nenhuma categoria cadastrada.</div>`;
    } else {
        chartCat.innerHTML = data.categorias.map(c => {
            const pct = (c.quantidade / maxCat) * 100;
            return `
            <div class="bar-row">
                <div class="bar-label">${c.nome}</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${pct}%; background: var(--green-500);"></div>
                </div>
                <div class="bar-value">${c.quantidade}</div>
            </div>
            `;
        }).join("");
    }

    // 4. Consumo por Talhão
    const maxTalhao = Math.max(...data.consumo_talhoes.map(t => t.quantidade), 1);
    const chartTal = document.getElementById("chartTalhoes");
    if (data.consumo_talhoes.length === 0) {
        chartTal.innerHTML = `<div style="color:var(--gray-500); font-size:0.875rem;">Nenhum consumo registrado em talhões.</div>`;
    } else {
        chartTal.innerHTML = data.consumo_talhoes.map(t => {
            const pct = (t.quantidade / maxTalhao) * 100;
            return `
            <div class="bar-row">
                <div class="bar-label">${t.talhao}</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${pct}%; background: var(--amber-500);"></div>
                </div>
                <div class="bar-value">${t.quantidade}</div>
            </div>
            `;
        }).join("");
    }

    // 5. Movimentações 30d (Gráfico de Barras Vertical Simples)
    const chartMov = document.getElementById("chartMovimentacoes");
    const dictEntradas = {};
    const dictSaidas = {};
    data.movimentacoes_periodo.entradas.forEach(e => dictEntradas[e.data] = e.total);
    data.movimentacoes_periodo.saidas.forEach(s => dictSaidas[s.data] = s.total);
    const totalEntradas = Object.values(dictEntradas).reduce((total, quantidade) => total + Number(quantidade || 0), 0);
    const totalSaidas = Object.values(dictSaidas).reduce((total, quantidade) => total + Number(quantidade || 0), 0);
    document.getElementById("chartTotalEntradas").innerText = totalEntradas.toLocaleString("pt-BR");
    document.getElementById("chartTotalSaidas").innerText = totalSaidas.toLocaleString("pt-BR");

    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    const ultimos30Dias = Array.from({ length: 30 }, (_, index) => {
        const dia = new Date(hoje);
        dia.setDate(hoje.getDate() - 29 + index);
        return [
            `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`,
            dia,
        ];
    });
    const maxVal = Math.max(
        1,
        ...ultimos30Dias.map(([data]) => Math.max(Number(dictEntradas[data] || 0), Number(dictSaidas[data] || 0)))
    );

    if (totalEntradas === 0 && totalSaidas === 0) {
        chartMov.innerHTML = `<div class="estoque-chart-empty">Sem movimentações nos últimos 30 dias.</div>`;
    } else {
        chartMov.innerHTML = ultimos30Dias.map(([data, dia], index) => {
            const ent = Number(dictEntradas[data] || 0);
            const sai = Number(dictSaidas[data] || 0);
            const hEnt = ent ? Math.max((ent / maxVal) * 100, 4) : 0;
            const hSai = sai ? Math.max((sai / maxVal) * 100, 4) : 0;
            const dayStr = `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}`;
            const label = index % 5 === 0 || index === 29 ? dayStr : "";
            return `
            <div class="v-bar-col" title="${dayStr} · Entradas: ${ent} · Saídas: ${sai}" aria-label="${dayStr}: ${ent} entradas e ${sai} saídas">
                <div class="v-bar-container">
                    <div class="v-bar-in" style="height: ${hEnt}%"></div>
                    <div class="v-bar-out" style="height: ${hSai}%"></div>
                </div>
                <div class="v-bar-label">${label}</div>
            </div>
            `;
        }).join("");
    }

    // 6. Movimentações Recentes Tabela
    const tbody = document.getElementById("listaRecentesDashboard");
    if(data.movimentacoes_recentes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="padding: 1rem 0; color: var(--gray-500); text-align:center;">Nenhuma movimentação</td></tr>`;
    } else {
        tbody.innerHTML = data.movimentacoes_recentes.map(m => {
            const dataFormatada = m.data.split("-").reverse().slice(0,2).join("/"); // dd/mm
            const color = m.tipo === "ENTRADA" ? "var(--green-600)" : "var(--red-600)";
            const sinal = m.tipo === "ENTRADA" ? "↑" : "↓";
            return `
            <tr style="border-bottom: 1px solid var(--gray-50);">
                <td data-label="Data" style="padding: 0.75rem 0; color: var(--gray-500); font-size: 0.875rem;">${dataFormatada}</td>
                <td data-label="Produto" style="padding: 0.75rem 0; color: var(--gray-900); font-size: 0.875rem; font-weight:500;">
                    ${m.produto} <br><small style="color:var(--gray-400); font-weight:400;">${m.motivo}</small>
                </td>
                <td data-label="Quantidade" style="padding: 0.75rem 0; text-align: right; color: ${color}; font-size: 0.875rem; font-weight:600;">
                    ${sinal} ${m.quantidade} <span style="font-size:0.7rem; font-weight:400;">${m.unidade}</span>
                </td>
            </tr>
            `;
        }).join("");
    }
}

async function carregarEstoque() {
    try {
        const res = await fetch("/api/estoque/produtos/");
        const data = await res.json();
        if (data.ok) {
            produtosGlobal = data.produtos;
            renderizarProdutos(produtosGlobal);
        }
    } catch (e) {
        showToast("Falha de conexão.", "error");
    }
}

async function carregarMovimentacoes() {
    try {
        const res = await fetch("/api/estoque/movimentacoes/");
        const data = await res.json();
        if (data.ok) {
            renderizarMovimentacoes(data.movimentacoes);
        }
    } catch (e) {
        console.error("Erro ao carregar movimentações", e);
    }
}

async function carregarTalhoes() {
    try {
        const res = await fetch("/api/state/");
        const data = await res.json();
        if (data.ok && data.talhoes) {
            talhoesGlobal = data.talhoes.filter(t => t.active !== false);
            const select = document.getElementById("saiTalhao");
            select.innerHTML = '<option value="">Selecione um talhão...</option>' + 
                talhoesGlobal.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
        }
    } catch (e) {
        console.error("Erro ao carregar talhões para estoque", e);
    }
}

function renderizarProdutos(lista) {
    const container = document.getElementById("listaProdutos");
    if (lista.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--gray-500); background: white; border-radius: 12px; border: 1px solid var(--gray-200);">Você ainda não possui produtos cadastrados.<br><br><button class="btn-primary" onclick="abrirModalNovoProduto()">Cadastrar primeiro produto</button></div>`;
        return;
    }

    container.innerHTML = lista.map(p => {
        let statusLabel = "Normal";
        if (p.status === "danger") statusLabel = "Sem Estoque";
        else if (p.status === "warning") statusLabel = "Estoque Baixo";

        return `
        <div class="produto-card">
            <div class="produto-header">
                <div>
                    <div class="produto-nome">${p.nome}</div>
                    <div class="produto-categoria">${p.categoria}</div>
                </div>
                <span class="status-badge status-${p.status}">${statusLabel}</span>
            </div>
            <div class="produto-qtd">
                ${p.quantidade_atual.toLocaleString("pt-BR")} <span class="produto-unidade">${p.unidade}</span>
            </div>
            ${p.estoque_minimo > 0 ? `<div style="font-size:0.75rem; color:var(--gray-500);">Estoque Mínimo: ${p.estoque_minimo}</div>` : ""}
            <div class="produto-actions">
                <button class="btn-ghost" style="flex:1; padding:0.5rem; justify-content:center; color:var(--green-600)" onclick="abrirModalEntrada(${p.id}, '${p.nome}', '${p.unidade}')">+ Entrada</button>
                <button class="btn-primary estoque-btn-saida" style="flex:1; padding:0.5rem; justify-content:center" onclick="abrirModalSaida(${p.id}, '${p.nome}', '${p.unidade}', ${p.quantidade_atual})">- Saída</button>
            </div>
        </div>
        `;
    }).join("");
}

function filtrarProdutos() {
    const btn = document.querySelector(".tab-btn.active");
    if (!btn) return;
    const categoria = btn.getAttribute("data-categoria");
    const busca = document.getElementById("buscaProduto").value.toLowerCase();
    
    let filtrados = produtosGlobal;
    if (categoria !== "Todos") {
        filtrados = filtrados.filter(p => p.categoria === categoria);
    }
    if (busca) {
        filtrados = filtrados.filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.toLowerCase().includes(busca));
    }
    
    renderizarProdutos(filtrados);
}

function renderizarMovimentacoes(lista) {
    const tbody = document.getElementById("listaMovimentacoesCompleta");
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 2rem; text-align: center; color: var(--gray-500);">Não há movimentações registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(m => {
        const dataFormatada = new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR");
        const isEntrada = m.tipo === "ENTRADA";
        const qtdStr = (isEntrada ? "+" : "-") + m.quantidade + " " + m.produto_unidade;
        const color = isEntrada ? "var(--green-600)" : "var(--red-600)";
        
        return `
        <tr style="border-bottom: 1px solid var(--gray-100);">
            <td data-label="Data" style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${dataFormatada}</td>
            <td data-label="Produto" style="padding: 1rem; font-weight: 500; color: var(--gray-900); font-size: 0.875rem;">${m.produto_nome}</td>
            <td data-label="Tipo" style="padding: 1rem;"><span class="status-badge" style="background:${isEntrada ? 'var(--green-50)' : 'var(--red-50)'}; color:${color};">${m.tipo}</span></td>
            <td data-label="Quantidade" style="padding: 1rem; text-align: right; font-weight: 600; color: ${color}; font-size: 0.875rem;">${qtdStr}</td>
            <td data-label="Motivo" style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${m.motivo}</td>
            <td data-label="Talhão" style="padding: 1rem; color: var(--gray-600); font-size: 0.875rem;">${m.talhao_nome || '-'}</td>
            <td data-label="Usuário" style="padding: 1rem; color: var(--gray-400); font-size: 0.75rem;">${m.usuario}</td>
        </tr>
        `;
    }).join("");
}

function showToast(msg, type="success") {
    const toast = document.getElementById("toast");
    if (!toast) {
        alert(msg);
        return;
    }
    toast.innerText = msg;
    toast.style.background = type === "error" ? "var(--red-600)" : "var(--green-600)";
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}

// ================= MODAIS ================= //

function abrirModalNovoProduto() {
    document.getElementById("formNovoProduto").reset();
    document.getElementById("modalNovoProduto").style.display = "flex";
}

function fecharModalNovoProduto() {
    document.getElementById("modalNovoProduto").style.display = "none";
}

async function salvarNovoProduto() {
    const nome = document.getElementById("npNome").value;
    const categoria = document.getElementById("npCategoria").value;
    const unidade = document.getElementById("npUnidade").value;
    
    if(!nome || !categoria || !unidade) {
        showToast("Preencha os campos obrigatórios.", "error");
        return;
    }

    const payload = {
        nome, categoria, unidade,
        estoque_inicial: document.getElementById("npInicial").value,
        estoque_minimo: document.getElementById("npMinimo").value,
        local_armazenamento: document.getElementById("npLocal").value
    };

    try {
        const res = await fetch("/api/estoque/produtos/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Produto cadastrado com sucesso!");
            fecharModalNovoProduto();
            carregarEstoque();
            carregarDashboard();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

async function atualizarSelectProdutos(selectId, setVal = null) {
    if (produtosGlobal.length === 0) {
        await carregarEstoque();
    }
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">Selecione um produto...</option>' + 
        produtosGlobal.map(p => `<option value="${p.id}" data-qtd="${p.quantidade_atual}" data-und="${p.unidade}">${p.nome} (${p.unidade})</option>`).join("");
    if(setVal) select.value = setVal;
}

function abrirModalEntrada(id=null, nome=null, unidade=null) {
    document.getElementById("formEntrada").reset();
    document.getElementById("entData").value = new Date().toISOString().split("T")[0];
    atualizarSelectProdutos("entProdutoId", id);
    document.getElementById("modalEntrada").style.display = "flex";
}

function fecharModalEntrada() {
    document.getElementById("modalEntrada").style.display = "none";
}

async function salvarEntrada() {
    const produto_id = document.getElementById("entProdutoId").value;
    const quantidade = document.getElementById("entQtd").value;
    const motivo = document.getElementById("entMotivo").value;
    const dataMov = document.getElementById("entData").value;
    
    if(!produto_id) {
        showToast("Selecione um produto.", "error");
        return;
    }
    if(!quantidade || quantidade <= 0) {
        showToast("Informe uma quantidade válida.", "error");
        return;
    }

    const payload = {
        produto_id, tipo: "ENTRADA", quantidade, motivo, data: dataMov,
        observacao: document.getElementById("entObs").value
    };

    try {
        const res = await fetch("/api/estoque/movimentacoes/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Entrada registrada com sucesso!");
            fecharModalEntrada();
            carregarEstoque();
            carregarMovimentacoes();
            carregarDashboard();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

function atualizarMaxSaida() {
    const select = document.getElementById("saiProdutoId");
    if(select.selectedIndex > 0) {
        const opt = select.options[select.selectedIndex];
        const maxQtd = opt.getAttribute("data-qtd");
        document.getElementById("saiQtdMax").innerText = `Disponível: ${maxQtd}`;
        document.getElementById("saiQtd").max = maxQtd;
    } else {
        document.getElementById("saiQtdMax").innerText = "";
        document.getElementById("saiQtd").max = "";
    }
}

function abrirModalSaida(id=null, nome=null, unidade=null, maxQtd=null) {
    document.getElementById("formSaida").reset();
    document.getElementById("saiData").value = new Date().toISOString().split("T")[0];
    toggleTalhaoSelect();
    atualizarSelectProdutos("saiProdutoId", id).then(() => {
        if(id) atualizarMaxSaida();
    });
    document.getElementById("modalSaida").style.display = "flex";
}

function fecharModalSaida() {
    document.getElementById("modalSaida").style.display = "none";
}

function toggleTalhaoSelect() {
    const motivo = document.getElementById("saiMotivo").value;
    const container = document.getElementById("saiTalhaoContainer");
    if (motivo === "Aplicação") {
        container.style.display = "block";
    } else {
        container.style.display = "none";
        document.getElementById("saiTalhao").value = "";
    }
}

async function salvarSaida() {
    const produto_id = document.getElementById("saiProdutoId").value;
    const quantidade = document.getElementById("saiQtd").value;
    const motivo = document.getElementById("saiMotivo").value;
    const dataMov = document.getElementById("saiData").value;
    const talhao_id = document.getElementById("saiTalhao").value;
    
    if(!produto_id) {
        showToast("Selecione um produto.", "error");
        return;
    }
    if(!quantidade || quantidade <= 0) {
        showToast("Informe uma quantidade válida.", "error");
        return;
    }
    if(motivo === "Aplicação" && !talhao_id) {
        showToast("Selecione um talhão para a aplicação.", "error");
        return;
    }

    const payload = {
        produto_id, tipo: "SAIDA", quantidade, motivo, data: dataMov, talhao_id,
        observacao: document.getElementById("saiObs").value
    };

    try {
        const res = await fetch("/api/estoque/movimentacoes/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
            showToast("Saída registrada com sucesso!");
            fecharModalSaida();
            carregarEstoque();
            carregarMovimentacoes();
            carregarDashboard();
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Erro de rede.", "error");
    }
}

// ================= RELATÓRIO PDF ================= //

function imprimirRelatorio(tipo) {
    const div = document.createElement("div");
    div.className = "print-area";
    div.style.background = "white";
    div.style.padding = "20px";
    
    const dataHoje = new Date().toLocaleDateString("pt-BR");
    let html = `
        <div style="text-align:center; margin-bottom: 2rem;">
            <h2>GOLDCROP - RELATÓRIO DE ESTOQUE</h2>
            <p>Data de geração: ${dataHoje}</p>
        </div>
    `;
    
    if (tipo === "atual" || tipo === "baixo") {
        html += `
            <h3>Produtos</h3>
            <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                <tr style="border-bottom:1px solid #000; text-align:left;">
                    <th style="padding:8px">Produto</th>
                    <th style="padding:8px">Categoria</th>
                    <th style="padding:8px; text-align:right;">Qtd</th>
                    <th style="padding:8px">Und</th>
                    <th style="padding:8px">Status</th>
                </tr>
        `;
        
        produtosGlobal.forEach(p => {
            if (tipo === "baixo" && p.status === "success") return;
            let st = p.status === "danger" ? "Sem Estoque" : (p.status === "warning" ? "Baixo" : "Normal");
            html += `
                <tr style="border-bottom:1px solid #ccc;">
                    <td style="padding:8px">${p.nome}</td>
                    <td style="padding:8px">${p.categoria}</td>
                    <td style="padding:8px; text-align:right;">${p.quantidade_atual}</td>
                    <td style="padding:8px">${p.unidade}</td>
                    <td style="padding:8px">${st}</td>
                </tr>
            `;
        });
        html += `</table>`;
    } else if (tipo === "movimentacoes") {
        html += `
            <h3>Histórico de Movimentações</h3>
            <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                <tr style="border-bottom:1px solid #000; text-align:left;">
                    <th style="padding:8px">Data</th>
                    <th style="padding:8px">Produto</th>
                    <th style="padding:8px">Tipo</th>
                    <th style="padding:8px; text-align:right;">Qtd</th>
                    <th style="padding:8px">Motivo</th>
                    <th style="padding:8px">Talhão</th>
                </tr>
        `;
        
        const tbody = document.getElementById("listaMovimentacoesCompleta");
        const rows = tbody.querySelectorAll("tr");
        rows.forEach(r => {
            if(r.cells.length > 1) {
                html += `
                    <tr style="border-bottom:1px solid #ccc;">
                        <td style="padding:8px">${r.cells[0].innerText}</td>
                        <td style="padding:8px">${r.cells[1].innerText}</td>
                        <td style="padding:8px">${r.cells[2].innerText}</td>
                        <td style="padding:8px; text-align:right;">${r.cells[3].innerText}</td>
                        <td style="padding:8px">${r.cells[4].innerText}</td>
                        <td style="padding:8px">${r.cells[5].innerText}</td>
                    </tr>
                `;
            }
        });
        html += `</table>`;
    }
    
    div.innerHTML = html;
    document.body.appendChild(div);
    
    setTimeout(() => {
        window.print();
        document.body.removeChild(div);
    }, 500);
}
