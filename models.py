from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Workspace(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.relationship('Note', backref='workspace', lazy=True)
    terminal_logs = db.relationship('TerminalLog', backref='workspace', lazy=True)
    checklist_items = db.relationship('ChecklistItem', backref='workspace', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspace.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class TerminalLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspace.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=True) # Full session log
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ChecklistItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey('workspace.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Snippet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    command = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
