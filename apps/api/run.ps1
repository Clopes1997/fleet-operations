$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
cd $PSScriptRoot
.\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
