"""
Server configuration for casino game scripts.
Reads server URL from server_config.yaml and game-specific configs from *_config.yaml.

Usage:
    from server_config import get_server_url, get_endpoint, load_game_config

    url = get_server_url()
    endpoint = get_endpoint("/api/keno/state-update")
    config = load_game_config("keno")
"""
import os
import yaml

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Cache for loaded configs
_server_config = None
_game_configs = {}


def _load_yaml(filename):
    """Load a YAML file from the scripts directory."""
    path = os.path.join(SCRIPT_DIR, filename)
    if not os.path.exists(path):
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _get_server_config():
    """Load and cache server_config.yaml."""
    global _server_config
    if _server_config is None:
        _server_config = _load_yaml("server_config.yaml")
    return _server_config


def get_server_url():
    """Get the server URL from server_config.yaml."""
    config = _get_server_config()
    return config.get("server_url", "http://localhost:3000").rstrip("/")


def get_endpoint(path):
    """Get a full endpoint URL by joining the server URL with the given path.
    
    Example:
        get_endpoint("/api/keno/state-update")
        # => "http://192.168.1.50:3000/api/keno/state-update"
    """
    base = get_server_url()
    path = path.lstrip("/")
    return f"{base}/{path}"


def load_game_config(game_name):
    """Load a game-specific config file (e.g. 'keno' -> keno_config.yaml).
    
    Returns a dict with the config values, or empty dict if file not found.
    Config is cached after first load.
    """
    global _game_configs
    if game_name not in _game_configs:
        _game_configs[game_name] = _load_yaml(f"{game_name}_config.yaml")
    return _game_configs[game_name]