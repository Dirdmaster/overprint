"""Behavior tests for the externally triggered repository agent."""
import hashlib
import hmac
import http.client
import threading
import json
from pathlib import Path
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from repo_agent.controller import Controller, Policy
from repo_agent.server import WebhookServer


class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.policy = Policy(repository_id=123, installation_id=456, owner_id=789, assignee_id=999)
        self.controller = Controller(Path(self.tmp.name) / 'queue.db', self.policy, b'secret')

    def event(self, action='assigned', sender=789, stamp='2026-09-21T12:00:00Z'):
        return {'action': action, 'sender': {'id': sender}, 'installation': {'id': 456},
                'repository': {'id': 123}, 'assignee': {'id': 999},
                'issue': {'id': 1001, 'number': 42, 'state': 'open', 'updated_at': stamp}}

    def deliver(self, event, delivery=None, signature=None, event_type='issues'):
        body = json.dumps(event).encode()
        headers = {'X-GitHub-Event': event_type, 'X-GitHub-Delivery': delivery or str(uuid.uuid4()),
                   'X-Hub-Signature-256': signature or 'sha256=' + hmac.new(b'secret', body, hashlib.sha256).hexdigest()}
        return self.controller.receive(headers, body)

    def test_only_owner_assignment_queues_one_job(self):
        self.assertEqual(self.deliver(self.event(sender=12))[0], 202)
        self.assertEqual(self.controller.jobs(), [])
        self.assertEqual(self.deliver(self.event(stamp="2026-09-21T12:00:01Z"))[0], 202)
        self.assertEqual([(j['issue_number'], j['status']) for j in self.controller.jobs()], [(42, 'queued')])

    def test_forged_wrong_target_and_nonassignment_never_queue(self):
        self.assertEqual(self.deliver(self.event(), signature='sha256=wrong')[0], 401)
        for field in ('repository', 'installation', 'assignee'):
            event = self.event()
            event[field]['id'] = 1
            self.deliver(event)
        for action in ('opened', 'edited', 'labeled', 'reopened'):
            self.deliver(self.event(action=action))
        self.deliver(self.event(), event_type='issue_comment')
        self.assertEqual(self.controller.jobs(), [])

    def test_delivery_and_assignment_duplicates_do_not_duplicate_jobs(self):
        delivery = str(uuid.uuid4())
        self.deliver(self.event(), delivery=delivery)
        self.deliver(self.event(), delivery=delivery)
        self.deliver(self.event())
        self.assertEqual(len(self.controller.jobs()), 1)
        self.assertEqual(self.deliver(self.event(sender=2), delivery=delivery)[0], 409)

    def test_unassignment_cancels_active_job_and_stale_event_cannot_resurrect_it(self):
        self.deliver(self.event())
        job = self.controller.claim()
        self.assertIsNotNone(job)
        self.assertIsNone(self.controller.claim())
        self.deliver(self.event(action='unassigned', stamp='2026-09-21T12:00:02Z'))
        self.assertFalse(self.controller.active(job['id']))
        self.controller.finish(job['id'], 'completed')
        self.deliver(self.event(stamp='2026-09-21T12:00:01Z'))
        self.assertEqual([j['status'] for j in self.controller.jobs()], ['cancelled'])
        self.deliver(self.event(stamp='2026-09-21T12:00:03Z'))
        self.assertIsNotNone(self.controller.claim())

    def test_close_cancels_queued_job_even_with_no_assignee(self):
        self.deliver(self.event())
        event = self.event(action='closed')
        event['assignee'] = None
        event['issue']['state'] = 'closed'
        self.deliver(event)
        self.assertIsNone(self.controller.claim())
        self.assertEqual(self.controller.jobs()[0]['status'], 'cancelled')

    def test_restart_preserves_queued_work_but_does_not_replay_interrupted_work(self):
        self.deliver(self.event())
        self.controller.claim()
        restarted = Controller(Path(self.tmp.name) / 'queue.db', self.policy, b'secret')
        restarted.recover()
        self.assertIsNone(restarted.claim())
        self.assertEqual(restarted.jobs()[0]['status'], 'failed')

    def test_http_boundary_accepts_signed_assignment_and_hides_job_data(self):
        server = WebhookServer(('127.0.0.1', 0), self.controller)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=2)
            body = json.dumps(self.event()).encode()
            client.request('POST', '/webhook', body, {
                'X-GitHub-Event': 'issues', 'X-GitHub-Delivery': str(uuid.uuid4()),
                'X-Hub-Signature-256': 'sha256=' + hmac.new(b'secret', body, hashlib.sha256).hexdigest()})
            response = client.getresponse()
            self.assertEqual(response.status, 202)
            self.assertEqual(json.loads(response.read())['message'], 'Queued')
            client.request('GET', '/jobs')
            response = client.getresponse()
            self.assertEqual(response.status, 404)
            response.read()
            client.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_queue_cannot_be_reused_with_a_different_owner_policy(self):
        self.deliver(self.event())
        with self.assertRaises(ValueError):
            Controller(Path(self.tmp.name) / 'queue.db', Policy(123, 456, 2, 999), b'secret')

    def test_untrusted_shapes_fail_closed(self):
        for value in ([], None, 'text', {'action': 'assigned'}):
            self.assertEqual(self.deliver(value)[0], 400)
        event = self.event()
        event['sender']['id'] = True
        self.assertEqual(self.deliver(event)[0], 400)
        self.assertEqual(self.controller.jobs(), [])


if __name__ == '__main__':
    unittest.main()
