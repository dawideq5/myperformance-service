<?php
defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname' => '\core\event\user_loggedin',
        'callback'  => '\local_mpkc_sync\observer::on_login',
        'priority'  => 0,
        'internal'  => false,
    ],
];
