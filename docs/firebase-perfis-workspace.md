# Perfis, gestão de contas e workspace individual

## Modelo de dados

```text
users/{uid}
  displayName: string
  email: string
  photoURL: string
  role: "admin" | "manager" | "collaborator"
  disabled: boolean
  createdAt, updatedAt: timestamp
  createdBy: uid

users/{uid}/reminders/{reminderId}
  title: string
  notes: string
  dueAt: timestamp
  completed: boolean
  createdAt, updatedAt: timestamp

adminAudit/{eventId}
  action: "user.create" | "user.disable" | "user.enable"
  actorUid, actorEmail, targetUid
  details: map
  createdAt: timestamp
```

O documento `users/{uid}` é o perfil público interno. A subcoleção
`reminders` é privada: as regras exigem que o UID autenticado seja igual ao
UID do caminho.

## Arquitetura compatível com o plano Spark

O navegador chama endpoints serverless em `/api/admin`. A API hospedada na
Vercel valida o ID Token e usa o Admin SDK em um processo separado para criar a
segunda conta. Portanto, não há `createUserWithEmailAndPassword` na instância
Auth do navegador, e Isabela, Vanessa ou Tafarel continuam conectados.

Como o Firebase Storage não está disponível no projeto Spark atual, a foto é
recortada para 256x256 e compactada em WebP no navegador. O Data URL, limitado
a 180 KB no cliente e 200 KB nas regras, fica no documento `users/{uid}`.

## Claims

- `admin`: cria colaboradores e gestores; habilita/desabilita ambos.
- `manager`: cria e habilita/desabilita apenas colaboradores.
- `collaborator`: acessa o próprio perfil e workspace.

Claims são a fonte de autorização. O campo `role` no Firestore serve para
exibição e consultas, nunca como prova de permissão.

Depois de alterar uma claim, o usuário afetado deve renovar o ID token
(`currentUser.getIdToken(true)`) ou entrar novamente.

## Integração no front-end atual

Na inicialização Firebase do `index.html`, acrescente:

```js
import {
  createAccountManagementApi,
  createReminder,
  deleteReminder,
  getDueReminders,
  saveDisplayName,
  subscribeToReminders,
  updateReminder,
  uploadProfilePhoto
} from "./src/firebase/profile-workspace.js";

const firebaseServices = { auth, db };
const accountApi = createAccountManagementApi(auth);
```

Exemplos de handlers:

```js
await saveDisplayName(firebaseServices, nameInput.value);
await uploadProfilePhoto(firebaseServices, photoInput.files[0]);

await createReminder(firebaseServices, {
  title: "Cobrar a pendência do cliente Leandro",
  notes: "",
  // input datetime-local produz horário local; Date o converte para um instante.
  dueAt: new Date(reminderDateInput.value)
});

const unsubscribe = subscribeToReminders(firebaseServices, (items) => {
  renderReminderList(items);
  renderDueAlert(getDueReminders(items));
});

await updateReminder(firebaseServices, reminderId, { completed: true });
await deleteReminder(firebaseServices, reminderId);

await accountApi.createUser({
  displayName: "Leandro",
  email: "leandro@platino.com",
  password: temporaryPassword,
  role: "collaborator"
});
await accountApi.setDisabled(uid, true);
```

## Variáveis da Vercel

1. Habilitar Email/Password no Firebase Authentication.
Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e
`FIREBASE_PRIVATE_KEY` na Vercel. A chave vem de Configurações do projeto >
Contas de serviço > Gerar nova chave privada. Nunca grave o JSON no Git.

As contas legadas de Tafarel, Isabela e Vanessa são promovidas automaticamente
na primeira chamada autenticada à API administrativa.

Implante as regras com:

```powershell
firebase deploy --only firestore:rules
```

Depois, publique o projeto normalmente na Vercel.

## Datas e alertas

Armazene sempre `dueAt` como Firestore Timestamp (UTC) e exiba no fuso
`America/Sao_Paulo`. Para "amanhã", a interface deve transformar a expressão
em uma data/hora explícita e pedir confirmação antes de salvar.

O alerta visual pode ser calculado localmente com `getDueReminders`. Para
notificação mesmo com o sistema fechado, adicione FCM e uma Function agendada
que consulte lembretes pendentes por janela de tempo. Como os lembretes estão
em subcoleções, essa consulta futura deve usar `collectionGroup("reminders")`
e um índice em `completed + dueAt`.
