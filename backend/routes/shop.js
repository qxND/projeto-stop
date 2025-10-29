// backend/routes/shop.js
import { Router } from 'express';
import { supa } from '../services/supabase.js';
import { requireAuth } from '../middlewares/requireAuth.js'; // Reutiliza o middleware de autenticação

const router = Router();

// GET /shop/items - Lista todos os power-ups disponíveis na loja
router.get('/items', async (req, res) => {
  try {
    const { data, error } = await supa
      .from('power_up')
      .select('power_up_id, codigo_identificador, nome, descricao, preco')
      .order('preco', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[GET /shop/items] error', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /shop/inventory - Retorna as moedas e o inventário do jogador logado
router.get('/inventory', requireAuth, async (req, res) => {
  try {
    const jogador_id = req.user.jogador_id;

    // Busca moedas do jogador
    const { data: jogadorData, error: jogadorError } = await supa
      .from('jogador')
      .select('moedas')
      .eq('jogador_id', jogador_id)
      .single();

    if (jogadorError) throw jogadorError;
    if (!jogadorData) return res.status(404).json({ error: 'Jogador não encontrado' });

    // Busca inventário do jogador (join com power_up para pegar detalhes)
    const { data: inventoryData, error: inventoryError } = await supa
      .from('jogador_power_up')
      .select(`
        quantidade,
        power_up ( power_up_id, codigo_identificador, nome, descricao, preco )
      `)
      .eq('jogador_id', jogador_id)
      .gt('quantidade', 0); // Apenas itens que o jogador possui

    if (inventoryError) throw inventoryError;

    res.json({
      moedas: jogadorData.moedas || 0,
      inventario: (inventoryData || []).map(item => ({
        quantidade: item.quantidade,
        ...item.power_up // Achata os detalhes do power_up
      }))
    });

  } catch (e) {
    console.error('[GET /shop/inventory] error', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /shop/purchase - Compra um power-up
router.post('/purchase', requireAuth, async (req, res) => {
  try {
    const jogador_id = req.user.jogador_id;
    const { power_up_id } = req.body;
    const quantidade_compra = 1; // Por enquanto, compra 1 por vez

    if (!power_up_id) {
      return res.status(400).json({ error: 'power_up_id é obrigatório' });
    }

    // 1. Busca detalhes do power-up (preço) e moedas do jogador
    const { data: powerUpData, error: powerUpError } = await supa
      .from('power_up')
      .select('preco')
      .eq('power_up_id', power_up_id)
      .single();

    if (powerUpError) throw powerUpError;
    if (!powerUpData) return res.status(404).json({ error: 'Power-up não encontrado' });

    const { data: jogadorData, error: jogadorError } = await supa
      .from('jogador')
      .select('moedas')
      .eq('jogador_id', jogador_id)
      .single();

    if (jogadorError) throw jogadorError;
    if (!jogadorData) return res.status(404).json({ error: 'Jogador não encontrado' });

    const preco_item = powerUpData.preco;
    const moedas_jogador = jogadorData.moedas || 0; // Garante que é um número

    // 2. Verifica se tem moedas suficientes
    if (moedas_jogador < preco_item) {
      return res.status(400).json({ error: 'Moedas insuficientes' });
    }

    // 3. Tenta realizar a transação (idealmente usar transação SQL, mas Supabase JS client limita)
    //    Vamos fazer em duas etapas: debitar moedas e depois adicionar/incrementar item.

    // 3.1 Debitar moedas
    const novo_saldo = moedas_jogador - preco_item;
    const { error: updateMoedasError } = await supa
      .from('jogador')
      .update({ moedas: novo_saldo })
      .eq('jogador_id', jogador_id);

    if (updateMoedasError) {
      // Idealmente reverteria se possível, mas aqui apenas reportamos o erro
      throw new Error(`Erro ao debitar moedas: ${updateMoedasError.message}`);
    }

    // 3.2 Adicionar/Incrementar item no inventário (UPSERT)
    // Tenta incrementar a quantidade se o registro (jogador_id, power_up_id) já existe
    const { data: existingEntry, error: selectError } = await supa
      .from('jogador_power_up')
      .select('jogador_power_up_id, quantidade')
      .eq('jogador_id', jogador_id)
      .eq('power_up_id', power_up_id)
      .maybeSingle(); // Use maybeSingle para não dar erro se não existir

    let upsertError = null;
    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = not found, o que é esperado
        upsertError = selectError;
    } else if (existingEntry) {
        // Atualiza quantidade
        const { error: updateError } = await supa
            .from('jogador_power_up')
            .update({
                quantidade: existingEntry.quantidade + quantidade_compra,
                data_hora_ultima_aquisicao: new Date().toISOString()
            })
            .eq('jogador_power_up_id', existingEntry.jogador_power_up_id);
        upsertError = updateError;
    } else {
        // Insere novo registro
        const { error: insertError } = await supa
            .from('jogador_power_up')
            .insert({
                jogador_id: jogador_id,
                power_up_id: power_up_id,
                quantidade: quantidade_compra,
                data_hora_ultima_aquisicao: new Date().toISOString()
            });
        upsertError = insertError;
    }


    if (upsertError) {
      // Tenta devolver o dinheiro se o upsert falhar (best-effort)
       console.warn(`Falha ao atualizar inventário para ${jogador_id}, tentando devolver ${preco_item} moedas.`);
       await supa
          .from('jogador')
          .update({ moedas: moedas_jogador }) // Volta ao saldo original
          .eq('jogador_id', jogador_id);
      throw new Error(`Erro ao adicionar item ao inventário: ${upsertError.message}`);
    }

    // 4. Se tudo deu certo, retorna o novo saldo
    console.log(`[PURCHASE] Jogador ${jogador_id} comprou power-up ${power_up_id}. Novo saldo: ${novo_saldo}`);
    res.json({ success: true, novo_saldo: novo_saldo });

  } catch (e) {
    console.error('[POST /shop/purchase] error', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /shop/add-coins - Rota para *simular* a adição de moedas (não use em produção real sem segurança!)
router.post('/add-coins', requireAuth, async (req, res) => {
    try {
        const jogador_id = req.user.jogador_id;
        const { amount } = req.body; // Quantidade de moedas a adicionar

        if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
            return res.status(400).json({ error: 'Quantidade inválida ou não fornecida.' });
        }

        // Busca saldo atual
        const { data: jogador, error: getError } = await supa
            .from('jogador')
            .select('moedas')
            .eq('jogador_id', jogador_id)
            .single();

        if (getError) throw getError;
        if (!jogador) return res.status(404).json({ error: 'Jogador não encontrado.' });

        const novoSaldo = (jogador.moedas || 0) + amount;

        // Atualiza saldo no banco
        const { error: updateError } = await supa
            .from('jogador')
            .update({ moedas: novoSaldo })
            .eq('jogador_id', jogador_id);

        if (updateError) throw updateError;

        console.log(`[ADD COINS] Jogador ${jogador_id} adicionou ${amount} moedas (figurativo). Novo saldo: ${novoSaldo}`);
        res.json({ success: true, novo_saldo: novoSaldo });

    } catch (e) {
        console.error('[POST /shop/add-coins] error', e);
        res.status(500).json({ error: e.message || 'Erro ao adicionar moedas.' });
    }
});


export default router;
