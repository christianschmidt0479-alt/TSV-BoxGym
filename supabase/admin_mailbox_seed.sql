delete from public.admin_mailbox
where id like 'demo-%';

insert into public.admin_mailbox (
  id,
  sender,
  recipient,
  subject,
  snippet,
  content,
  status,
  type,
  created_at
)
values
  (
    'demo-inbox-1',
    'mitglied@example.org',
    'info@tsvboxgym.de',
    'Frage zur Trainingszeit',
    'Hallo, ich wollte kurz nachfragen, ob das Kindertraining in den Ferien wie gewohnt stattfindet.',
    'Hallo, ich wollte kurz nachfragen, ob das Kindertraining in den Ferien wie gewohnt stattfindet.\n\nAußerdem wüsste ich gern, ob mein Sohn dafür etwas Besonderes mitbringen muss.\n\nViele Grüße\nSandra Beispiel',
    'open',
    'inbox',
    timezone('utc', now()) - interval '2 hours'
  ),
  (
    'demo-inbox-2',
    'trainer.bewerbung@example.org',
    'info@tsvboxgym.de',
    'Unterlagen für Trainerrolle',
    'Guten Tag, anbei sende ich die fehlenden Unterlagen für die Trainerfreigabe und freue mich auf Rückmeldung.',
    'Guten Tag,\n\nanbei sende ich die fehlenden Unterlagen für die Trainerfreigabe.\n\nFalls noch Dokumente fehlen, geben Sie mir bitte kurz Bescheid.\n\nMit freundlichen Grüßen\nAlex Trainer',
    'open',
    'inbox',
    timezone('utc', now()) - interval '1 day'
  ),
  (
    'demo-draft-1',
    'info@tsvboxgym.de',
    'mitglied@example.org',
    'Re: Frage zur Trainingszeit',
    'Hallo Sandra, vielen Dank für die Nachricht. In den Ferien läuft der Check-in über die Stammgruppe.',
    'Hallo Sandra,\n\nvielen Dank für die Nachricht. In den Ferien läuft der Check-in bei uns über die Stammgruppe.\n\nIch prüfe gerade noch die genaue Trainingszeit für die Kindergruppe und melde mich dazu heute noch einmal kurz zurück.\n\nSportliche Grüße\nTSV BoxGym',
    'draft',
    'draft',
    timezone('utc', now()) - interval '30 minutes'
  );