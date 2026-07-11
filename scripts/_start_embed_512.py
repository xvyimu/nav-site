import os, sys
os.environ["EMBEDDING_MODEL"] = "BAAI/bge-small-zh-v1.5"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["EMBED_PORT"] = "8003"
sys.path.insert(0, r"D:\nav-site\scripts")
# run embed-server main
import runpy
runpy.run_path(r"D:\nav-site\scripts\embed-server.py", run_name="__main__")