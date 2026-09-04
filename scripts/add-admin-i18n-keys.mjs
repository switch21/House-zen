/**
 * HOUSE-ZEN — injecte les clés i18n "back-office super admin" dans fr et en
 * (seul en doit refléter fr à 100 % — tests i18n). Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FR = {
  'admin.dashboard': 'Tableau de bord',
  'admin.users': 'Utilisateurs',
  'admin.tenants': 'Tenants',
  'admin.empty': 'Aucun tenant pour le moment.',
  'admin.tenantsHint': 'Création, édition, plan, statut et suppression des organisations clientes.',
  'admin.newTenant': 'Nouveau tenant',
  'admin.editTenant': 'Modifier le tenant',
  'admin.setPlan': 'Changer le plan',
  'admin.deleteTenantConfirm':
    'Supprimer ce tenant efface TOUTES ses données (établissements, réservations, factures). Cette action est irréversible. Confirmer ?',
  'admin.currency': 'Devise',
  'admin.locale': 'Langue',
  'admin.timezone': 'Fuseau horaire',
  'admin.usersHint': 'Création de comptes, affectation aux tenants et gestion des accès.',
  'admin.newUser': 'Nouvel utilisateur',
  'admin.newUserHint': 'Le compte est créé actif (e-mail confirmé) avec le mot de passe fourni (8 caractères minimum).',
  'admin.editUser': 'Modifier l’utilisateur',
  'admin.password': 'Mot de passe',
  'admin.newPassword': 'Nouveau mot de passe (8 caractères minimum)',
  'admin.resetPassword': 'Réinitialiser le mot de passe',
  'admin.assignTenant': 'Affecter',
  'admin.removeMembership': 'Retirer du tenant',
  'admin.role': 'Rôle',
  'admin.noMemberships': 'Aucun tenant',
  'admin.superAdminFlag': 'Super admin',
  'admin.created': 'Créé le',
  'admin.lastSignIn': 'Dernière connexion',
  'admin.deleteUserConfirm': 'Supprimer cet utilisateur et toutes ses affectations ? Action irréversible.',
  'admin.plansHint': 'Grilles tarifaires et quotas de la plateforme SaaS.',
  'admin.newPlan': 'Nouveau plan',
  'admin.editPlan': 'Modifier le plan',
  'admin.price': 'Prix mensuel',
  'admin.limits': 'Quotas (étab. / chamb. / util.)',
  'admin.features': 'Fonctionnalités (séparées par des virgules)',
  'admin.maxProperties': 'Établissements max',
  'admin.maxRooms': 'Chambres max',
  'admin.maxUsers': 'Utilisateurs max',
  'admin.kpi.tenants': 'Tenants',
  'admin.kpi.active': 'actifs',
  'admin.kpi.suspended': 'suspendus',
  'admin.kpi.users': 'Utilisateurs',
  'admin.kpi.newUsers30': 'Nouveaux (30 j)',
  'admin.kpi.mrrHint': 'Revenu mensuel récurrent (abonnements actifs)',
  'admin.kpi.superAdmins': 'Super admins',
  'admin.kpi.superAdminsHint': 'Opérateurs de la plateforme',
  'admin.kpi.planDistribution': 'Abonnements par plan',
  'admin.kpi.latestTenants': 'Derniers tenants',
  'admin.kpi.latestUsers': 'Derniers utilisateurs',
};

const EN = {
  'admin.dashboard': 'Dashboard',
  'admin.users': 'Users',
  'admin.tenants': 'Tenants',
  'admin.empty': 'No tenants yet.',
  'admin.tenantsHint': 'Create, edit, assign a plan, change status and delete customer organisations.',
  'admin.newTenant': 'New tenant',
  'admin.editTenant': 'Edit tenant',
  'admin.setPlan': 'Change plan',
  'admin.deleteTenantConfirm':
    'Deleting this tenant removes ALL its data (properties, reservations, invoices). This action cannot be undone. Confirm?',
  'admin.currency': 'Currency',
  'admin.locale': 'Language',
  'admin.timezone': 'Time zone',
  'admin.usersHint': 'Create accounts, assign them to tenants and manage access.',
  'admin.newUser': 'New user',
  'admin.newUserHint': 'The account is created active (e-mail confirmed) with the provided password (8 characters minimum).',
  'admin.editUser': 'Edit user',
  'admin.password': 'Password',
  'admin.newPassword': 'New password (8 characters minimum)',
  'admin.resetPassword': 'Reset password',
  'admin.assignTenant': 'Assign',
  'admin.removeMembership': 'Remove from tenant',
  'admin.role': 'Role',
  'admin.noMemberships': 'No tenant',
  'admin.superAdminFlag': 'Super admin',
  'admin.created': 'Created on',
  'admin.lastSignIn': 'Last sign-in',
  'admin.deleteUserConfirm': 'Delete this user and all their assignments? This cannot be undone.',
  'admin.plansHint': 'SaaS platform pricing grids and quotas.',
  'admin.newPlan': 'New plan',
  'admin.editPlan': 'Edit plan',
  'admin.price': 'Monthly price',
  'admin.limits': 'Quotas (prop. / rooms / users)',
  'admin.features': 'Features (comma-separated)',
  'admin.maxProperties': 'Max properties',
  'admin.maxRooms': 'Max rooms',
  'admin.maxUsers': 'Max users',
  'admin.kpi.tenants': 'Tenants',
  'admin.kpi.active': 'active',
  'admin.kpi.suspended': 'suspended',
  'admin.kpi.users': 'Users',
  'admin.kpi.newUsers30': 'New (30 d)',
  'admin.kpi.mrrHint': 'Monthly recurring revenue (active subscriptions)',
  'admin.kpi.superAdmins': 'Super admins',
  'admin.kpi.superAdminsHint': 'Platform operators',
  'admin.kpi.planDistribution': 'Subscriptions per plan',
  'admin.kpi.latestTenants': 'Latest tenants',
  'admin.kpi.latestUsers': 'Latest users',
};

const FILES = {
  fr: { path: 'src/lib/i18n/locales/fr.ts', keys: FR, anchor: "'admin.impersonateHint':" },
  en: { path: 'src/lib/i18n/locales/en.ts', keys: EN, anchor: "'admin.impersonateHint':" },
};

let touched = 0;
for (const [loc, cfg] of Object.entries(FILES)) {
  let src = readFileSync(cfg.path, 'utf8');
  const anchorIdx = src.indexOf(cfg.anchor);
  if (anchorIdx === -1) {
    console.error(`[${loc}] anchor ${cfg.anchor} introuvable`);
    process.exit(1);
  }
  const lineEnd = src.indexOf('\n', anchorIdx);
  let added = 0;
  const missing = Object.entries(cfg.keys).filter(([k]) => !src.includes(`'${k}':`));
  if (missing.length > 0) {
    const block = '\n' + missing.map(([k, v]) => `  '${k}': '${v.replaceAll("'", "\\'")}',`).join('\n') + '\n';
    src = src.slice(0, lineEnd + 1) + block + src.slice(lineEnd + 1);
    added = missing.length;
    writeFileSync(cfg.path, src);
  }
  touched += added;
  console.log(`[${loc}] +${added} clés`);
}
console.log(`Total: ${touched} clés ajoutées.`);
