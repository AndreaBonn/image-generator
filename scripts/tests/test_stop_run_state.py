import json

from stop_support import (
    backend_cmdline,
    engine_cmdline,
    make_kill_recorder,
    make_notify_recorder,
    platform_support,
    stop_mod,
)

# =====================================================================
# run-state file: read_run_state / remove_run_state_file
# =====================================================================


def test_read_run_state_returns_none_when_file_missing(tmp_path):
    assert stop_mod.read_run_state(tmp_path) is None


def test_read_run_state_parses_the_json_file(tmp_path):
    path = platform_support.run_state_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"engine": 11, "backend": 22}))

    state = stop_mod.read_run_state(tmp_path)

    assert state == stop_mod.RunState(engine_pid=11, backend_pid=22)


def test_read_run_state_none_engine_is_preserved(tmp_path):
    path = platform_support.run_state_path(tmp_path)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"engine": None, "backend": 22}))

    state = stop_mod.read_run_state(tmp_path)

    assert state.engine_pid is None
    assert state.backend_pid == 22


def test_remove_run_state_file_is_a_noop_when_missing(tmp_path):
    stop_mod.remove_run_state_file(tmp_path)  # must not raise


# =====================================================================
# stop_via_run_state: the four branches with a run-state file present
# =====================================================================


def test_stop_via_run_state_removes_file_and_reports_not_running_when_no_pids(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=None)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: True,
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "Non era in esecuzione.")]
    assert not platform_support.run_state_path(tmp_path).exists()


def test_stop_via_run_state_reports_stale_when_recorded_pids_are_gone(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: False,  # both already dead: stale file
        notify_send=notify_send,
    )

    assert code == 0
    assert messages == [("Image Generator", "File di stato obsoleto: rimosso.")]


def test_stop_via_run_state_stops_both_recorded_pids_on_posix(tmp_path):
    kill, sent = make_kill_recorder()
    notify_send, messages = make_notify_recorder()
    alive = {11, 22}
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    def process_exists(pid):
        return pid in alive

    def process_cmdline(pid):
        return engine_cmdline() if pid == 11 else backend_cmdline()

    def send_signal_and_kill(pid, signal_name):
        kill(pid, signal_name)
        if signal_name == "SIGTERM":
            alive.discard(pid)  # dies gracefully in this test

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=process_exists,
        process_cmdline=process_cmdline,
        send_signal=send_signal_and_kill,
        sleep=lambda s: None,
        notify_send=notify_send,
    )

    assert code == 0
    assert sorted(sent) == [(11, "SIGTERM"), (22, "SIGTERM")]
    assert messages[-1] == (
        "Image Generator",
        "Chiuso. La memoria della scheda video è libera.",
    )


def test_stop_via_run_state_ignores_engine_when_it_was_preexisting(tmp_path):
    kill, sent = make_kill_recorder()
    notify_send, _messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=22)  # engine not started by start.py

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: pid == 22,  # 22 never dies in this test
        process_cmdline=lambda pid: backend_cmdline(),
        send_signal=kill,
        sleep=lambda s: None,
        timeout_s=0,  # force immediate escalation instead of a real wait
        notify_send=notify_send,
    )

    assert code == 1  # 22 "survives" both signals since process_exists always says alive
    assert sent == [(22, "SIGTERM"), (22, "SIGKILL")]  # engine (None) never touched


def test_stop_via_run_state_returns_1_when_a_pid_survives_force(tmp_path):
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=None, backend_pid=22)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: True,  # never dies, not even after SIGKILL
        process_cmdline=lambda pid: backend_cmdline(),
        send_signal=lambda pid, sig: None,
        sleep=lambda s: None,
        timeout_s=0,
        notify_send=notify_send,
    )

    assert code == 1
    assert messages[-1] == (
        "Image Generator",
        "Alcuni processi non si chiudono nemmeno forzandoli: riavvia il computer.",
    )


def test_stop_via_run_state_reports_unverifiable_pid_and_keeps_state_file(tmp_path):
    """A3: process_cmdline(pid) returning None on a *live* PID means "can't
    read its command line", not "not ours". Silently skipping it let the
    final message claim "Non era in esecuzione." while the process (and the
    GPU memory it holds) was still alive. It must neither be signalled nor
    have the run-state file dropped, and the report must name the PID."""
    kill, sent = make_kill_recorder()
    notify_send, messages = make_notify_recorder()
    state = stop_mod.RunState(engine_pid=11, backend_pid=None)
    state_path = platform_support.run_state_path(tmp_path)
    state_path.parent.mkdir(parents=True)
    state_path.write_text(json.dumps({"engine": 11, "backend": None}))

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: True,
        process_cmdline=lambda pid: None,  # unreadable, but the PID is alive
        send_signal=kill,
        sleep=lambda s: None,
        notify_send=notify_send,
    )

    assert code == 1
    assert sent == []  # never signalled: might not be ours
    assert state_path.exists()  # not dropped: we might still need to track it
    assert "11" in messages[-1][1]
    assert "non posso verificare" in messages[-1][1]


def test_stop_via_run_state_skips_pid_whose_cmdline_does_not_match(tmp_path):
    """T0xx MEDIUM finding: a crash followed by a restart can let an
    unrelated process reuse a recorded PID. The command line, not the bare
    PID, decides whether it is still ours to signal."""
    kill, sent = make_kill_recorder()
    notify_send, messages = make_notify_recorder()
    alive = {11, 22}
    state = stop_mod.RunState(engine_pid=11, backend_pid=22)

    def process_cmdline(pid):
        if pid == 11:
            return "/usr/bin/some-unrelated-daemon --port 11"  # PID 11 reused
        return backend_cmdline()

    def send_signal_and_kill(pid, signal_name):
        kill(pid, signal_name)
        if signal_name == "SIGTERM":
            alive.discard(pid)

    code = stop_mod.stop_via_run_state(
        tmp_path,
        state,
        os_name="linux",
        process_exists=lambda pid: pid in alive,
        process_cmdline=process_cmdline,
        send_signal=send_signal_and_kill,
        sleep=lambda s: None,
        notify_send=notify_send,
    )

    assert code == 0
    assert sent == [(22, "SIGTERM")]  # pid 11 never signalled: foreign process
    assert messages[-1] == (
        "Image Generator",
        "Chiuso. La memoria della scheda video è libera.",
    )
    assert not platform_support.run_state_path(tmp_path).exists()


# =====================================================================
# pid_cmdline_matches: the pure string-matching ownership check
# =====================================================================


def test_pid_cmdline_matches_posix_requires_every_marker():
    assert stop_mod.pid_cmdline_matches(engine_cmdline(), os_name="linux", kind="engine")
    assert not stop_mod.pid_cmdline_matches(
        "/usr/bin/python3 /some/other/main.py", os_name="linux", kind="engine"
    )


def test_pid_cmdline_matches_posix_backend_requires_uvicorn_and_app_main():
    assert stop_mod.pid_cmdline_matches(backend_cmdline(), os_name="darwin", kind="backend")
    assert not stop_mod.pid_cmdline_matches(
        "uvicorn some.other.module:app", os_name="darwin", kind="backend"
    )


def test_pid_cmdline_matches_windows_checks_image_name_only():
    # tasklist /FO CSV /NH exposes only the image name, not the full argv.
    assert stop_mod.pid_cmdline_matches(
        '"python.exe","1234","Console","1","12,345 K"', os_name="windows", kind="engine"
    )
    assert not stop_mod.pid_cmdline_matches(
        '"notepad.exe","1234","Console","1","12,345 K"',
        os_name="windows",
        kind="backend",
    )
