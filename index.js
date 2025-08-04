const WORK_COOLDOWN_MS = 20 * 60 * 1000;
const WORK_REWARD = 25;
const SHOP_ITEMS = [
  { id: 'pao', name: 'Pão Francês', price: 5, description: 'Quentinho e crocante.' },
  { id: 'agua', name: 'Garrafa de Água', price: 8, description: 'Para matar a sede.' },
  { id: 'maca', name: 'Maçã', price: 12, description: 'Uma maçã por dia...' },
  { id: 'pocao_cura', name: 'Poção de Cura', price: 50, description: 'Restaura sua energia.' },
  {
    id: 'amuleto_sorte',
    name: 'Amuleto da Sorte',
    price: 200,
    description: 'Aumenta suas chances de sucesso.',
  },
  {
    id: 'espada_lendaria',
    name: 'Espada Lendária',
    price: 1000,
    description: 'Uma espada forjada por lendas.',
  },
  {
    id: 'armadura_divina',
    name: 'Armadura Divina',
    price: 2500,
    description: 'Proteção abençoada pelos deuses.',
  },
];

function readEconomyData(fs, path, addonPath) {
  console.log('[DEBUG] Entrando em readEconomyData');
  const economyDataFile = path.join(addonPath, 'economia.json');
  try {
    console.log(`[DEBUG] Verificando existência de ${economyDataFile}`);
    if (!fs.existsSync(economyDataFile)) {
      console.log('[DEBUG] Arquivo não existe. Criando novo.');
      fs.writeFileSync(economyDataFile, JSON.stringify({}));
    }
    const fileContent = fs.readFileSync(economyDataFile, 'utf-8');
    console.log('[DEBUG] Dados lidos com sucesso');
    return JSON.parse(fileContent || '{}');
  } catch (error) {
    console.error('[ERROR] Erro ao ler dados:', error);
    return {};
  }
}

function writeEconomyData(fs, path, addonPath, data) {
  console.log('[DEBUG] Entrando em writeEconomyData');
  const economyDataFile = path.join(addonPath, 'economia.json');
  try {
    fs.writeFileSync(economyDataFile, JSON.stringify(data, null, 2));
    console.log('[DEBUG] Dados escritos com sucesso');
  } catch (error) {
    console.error('[ERROR] Erro ao escrever dados:', error);
  }
}

function getUserProfile(data, userJid) {
  console.log(`[DEBUG] getUserProfile - JID: ${userJid}`);
  if (!data[userJid]) {
    console.log('[DEBUG] Perfil não encontrado, criando novo');
    data[userJid] = { balance: 0, lastWork: 0, inventory: [] };
    return { profile: data[userJid], needsUpdate: true };
  }
  console.log('[DEBUG] Perfil existente encontrado');
  return { profile: data[userJid], needsUpdate: false };
}

async function handle(params) {
  console.log('[DEBUG] Entrando na função handle');

  const { bridge, fullArgs, messageInfo } = params;
  const { sendErrorReply, sendWaitReply, editMessage, sendSuccessReact, sendWarningReact } = bridge;
  const { userJid, addonPath, commandName, addonName } = messageInfo;
  const originalMessageKey = messageInfo.webMessage.key;

  try {
    console.log(`[DEBUG] Comando: ${commandName}, User: ${userJid}`);

    const fs = bridge.require('fs');
    const path = bridge.require('path');

    const sentMessage = await sendWaitReply(`⏳ Processando comando */${commandName}*...`);
    const sentMessageKey = sentMessage.key;

    const economyData = readEconomyData(fs, path, addonPath);

    const getRecipientJid = () =>
      messageInfo.webMessage?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    switch (commandName) {
      case 'saldo': {
        console.log('[DEBUG] Entrando em saldo');
        const { profile } = getUserProfile(economyData, userJid);
        console.log(`[DEBUG] Saldo do usuário: ${profile.balance}`);
        await editMessage(
          sentMessageKey,
          `💰 Seu saldo atual é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        break;
      }

      case 'trabalhar': {
        console.log('[DEBUG] Entrando em trabalhar');
        const { profile } = getUserProfile(economyData, userJid);
        const currentTime = Date.now();
        const remainingTime = WORK_COOLDOWN_MS - (currentTime - profile.lastWork);

        console.log(`[DEBUG] Cooldown restante: ${remainingTime}ms`);

        if (remainingTime > 0) {
          const minutes = Math.ceil(remainingTime / 60000);
          console.log('[DEBUG] Cooldown ativo');
          await editMessage(
            sentMessageKey,
            `Você precisa descansar! Tente novamente em *${minutes} minuto(s)*.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        profile.balance += WORK_REWARD;
        profile.lastWork = currentTime;
        console.log(`[DEBUG] Trabalho concluído. Novo saldo: ${profile.balance}`);

        await editMessage(
          sentMessageKey,
          `🎉 Você trabalhou e ganhou *R$ ${WORK_REWARD.toFixed(
            2
          )}*! Seu novo saldo é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        break;
      }

      case 'loja':
      case 'comprar': {
        console.log('[DEBUG] Entrando em loja/comprar');

        if (!fullArgs || commandName === 'loja') {
          console.log('[DEBUG] Mostrando itens da loja');
          let shopList = '🛒 *Itens disponíveis na loja:*\n\n';
          SHOP_ITEMS.forEach((item) => {
            shopList += `*${item.name}* - R$ ${item.price.toFixed(2)}\n_${item.description}_\n\n`;
          });
          shopList += `Para comprar, use: */comprar <ID do item>*`;
          await editMessage(sentMessageKey, shopList);
          break;
        }

        const itemName = fullArgs.toLowerCase().trim();
        console.log(`[DEBUG] Tentando comprar: ${itemName}`);
        const itemToBuy = SHOP_ITEMS.find(
          (item) => item.name.toLowerCase() === itemName || item.id.toLowerCase() === itemName
        );

        if (!itemToBuy) {
          console.log('[DEBUG] Item não encontrado');
          await editMessage(
            sentMessageKey,
            `O item "${fullArgs}" não foi encontrado na loja. Use */loja* para ver a lista.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        const { profile } = getUserProfile(economyData, userJid);
        console.log(`[DEBUG] Saldo atual: ${profile.balance}, Preço: ${itemToBuy.price}`);

        if (profile.balance < itemToBuy.price) {
          console.log('[DEBUG] Saldo insuficiente');
          await editMessage(
            sentMessageKey,
            `Seu saldo (R$ ${profile.balance.toFixed(2)}) é insuficiente para comprar *${
              itemToBuy.name
            }* (R$ ${itemToBuy.price.toFixed(2)}).`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        profile.balance -= itemToBuy.price;
        profile.inventory.push(itemToBuy.id);
        console.log(`[DEBUG] Compra realizada. Novo saldo: ${profile.balance}`);

        await editMessage(
          sentMessageKey,
          `🛍️ Você comprou *${itemToBuy.name}* por *R$ ${itemToBuy.price.toFixed(
            2
          )}*! Seu novo saldo é: *R$ ${profile.balance.toFixed(2)}*.`
        );
        break;
      }

      case 'inventario': {
        console.log('[DEBUG] Entrando em inventario');
        const { profile } = getUserProfile(economyData, userJid);

        if (!profile.inventory || profile.inventory.length === 0) {
          console.log('[DEBUG] Inventário vazio');
          await editMessage(sentMessageKey, '🎒 Seu inventário está vazio.');
          break;
        }

        let inventoryList = '🎒 *Seu inventário:*\n\n';
        const itemCounts = profile.inventory.reduce((acc, id) => {
          acc[id] = (acc[id] || 0) + 1;
          return acc;
        }, {});
        console.log('[DEBUG] Inventário processado:', itemCounts);

        for (const id in itemCounts) {
          const item = SHOP_ITEMS.find((i) => i.id === id);
          if (item) inventoryList += `*${item.name}* (x${itemCounts[id]})\n`;
        }

        await editMessage(sentMessageKey, inventoryList);
        break;
      }

      case 'transferir': {
        console.log('[DEBUG] Entrando em transferir');
        const parts = fullArgs.split(' ');
        const recipientJid = getRecipientJid();
        const amount = parseInt(parts.find((p) => !isNaN(p)));

        console.log(`[DEBUG] Destinatário: ${recipientJid}, Valor: ${amount}`);

        if (!recipientJid || !amount || amount <= 0) {
          console.log('[DEBUG] Parâmetros inválidos');
          await editMessage(sentMessageKey, 'Uso correto: */transferir @usuário <valor>*');
          await sendWarningReact(originalMessageKey);
          return;
        }

        if (recipientJid === userJid) {
          console.log('[DEBUG] Tentando transferir para si mesmo');
          await editMessage(sentMessageKey, 'Você não pode transferir dinheiro para si mesmo!');
          await sendWarningReact(originalMessageKey);
          return;
        }

        const { profile: senderProfile } = getUserProfile(economyData, userJid);
        if (senderProfile.balance < amount) {
          console.log('[DEBUG] Saldo insuficiente para transferência');
          await editMessage(
            sentMessageKey,
            `Seu saldo (R$ ${senderProfile.balance.toFixed(
              2
            )}) é insuficiente para transferir *R$ ${amount.toFixed(2)}*.`
          );
          await sendWarningReact(originalMessageKey);
          return;
        }

        const { profile: recipientProfile } = getUserProfile(economyData, recipientJid);
        senderProfile.balance -= amount;
        recipientProfile.balance += amount;
        console.log(`[DEBUG] Transferência concluída. Novo saldo: ${senderProfile.balance}`);

        await editMessage(
          sentMessageKey,
          `💸 Você transferiu *R$ ${amount.toFixed(2)}* para @${
            recipientJid.split('@')[0]
          }! Seu novo saldo é: *R$ ${senderProfile.balance.toFixed(2)}*.`,
          [recipientJid]
        );
        break;
      }

      default:
        console.log('[DEBUG] Comando não reconhecido');
        await editMessage(sentMessageKey, `Comando de economia desconhecido: ${commandName}`);
        await sendWarningReact(originalMessageKey);
        return;
    }

    console.log('[DEBUG] Salvando dados no final do handle');
    writeEconomyData(fs, path, addonPath, economyData);
    await sendSuccessReact(originalMessageKey);
  } catch (error) {
    console.error(`[ERROR] Erro CRÍTICO no handle:`, error);
    if (sendErrorReply) {
      await sendErrorReply('Ocorreu um problema interno ao executar este comando.');
    }
  }
}

module.exports = { handle };
